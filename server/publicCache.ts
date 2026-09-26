import { eq } from "drizzle-orm";
import { organizations, responsibleProfiles } from "../drizzle/schema";
import type { getDb } from "./db";

type Database = Awaited<ReturnType<typeof getDb>>;

function publicSlug(slug: string) {
  return slug === "felipe-demo" ? "masterplan-business" : slug;
}

function profileSlug(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function catalogApiKey(origin: string, slug: string, responsible?: string) {
  const url = new URL("/api/trpc/portal.publicCatalog", origin);
  const input: { json: { slug: string; responsible?: string } } = { json: { slug } };
  if (responsible) input.json.responsible = responsible;
  url.searchParams.set("input", JSON.stringify(input));
  return new Request(url.toString(), { method: "GET" });
}

export async function invalidateOrganizationPublicCache(db: Database, organizationId: number) {
  const cache = (globalThis as unknown as { caches?: CacheStorage & { default: Cache } }).caches?.default;
  if (!cache || !db) return;
  try {
    const [organization] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!organization) return;
    const slug = publicSlug(organization.slug);
    const profiles = await db.select({ name: responsibleProfiles.name }).from(responsibleProfiles).where(eq(responsibleProfiles.organizationId, organizationId));
    const origin = "https://meulink.imb.br";
    const keys: Request[] = [
      catalogApiKey(origin, slug),
      new Request(`${origin}/tabela/${slug}`, { method: "GET" }),
      new Request(`${origin}/tabelas/${slug}`, { method: "GET" }),
    ];
    for (const profile of profiles) {
      const profilePath = profileSlug(profile.name);
      keys.push(catalogApiKey(origin, slug, profilePath));
      keys.push(new Request(`${origin}/tabela/${slug}/${profilePath}`, { method: "GET" }));
      keys.push(new Request(`${origin}/tabelas/${slug}/${profilePath}`, { method: "GET" }));
    }
    await Promise.all(keys.map(key => cache.delete(key)));
  } catch {
    // Cache invalidation must never make a successful database mutation fail.
  }
}
