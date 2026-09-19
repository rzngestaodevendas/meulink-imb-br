import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { organizations, properties } from "../drizzle/schema";
import catalog from "../../meulink-imb-br/data-interna.json" with { type: "json" };

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const db = drizzle(databaseUrl);
let [organization] = await db.select().from(organizations).where(eq(organizations.slug, "felipe-demo")).limit(1);
if (!organization) {
  await db.insert(organizations).values({ slug: "felipe-demo", name: "Operação Felipe Fachinello", publicName: "MeuLink Imóveis" });
  [organization] = await db.select().from(organizations).where(eq(organizations.slug, "felipe-demo")).limit(1);
}
if (!organization) throw new Error("Seed organization could not be created");

const existing = await db.select({ id: properties.id }).from(properties).where(eq(properties.organizationId, organization.id)).limit(1);
if (existing.length) {
  console.log(`catalog already has data for organization ${organization.id}; skipping seed`);
  process.exit(0);
}

await db.insert(properties).values(catalog.map(item => ({
  organizationId: organization.id,
  slug: item.slug,
  title: item.titulo,
  address: item.endereco || null,
  details: JSON.stringify(item.detalhes || []),
  price: item.preco || null,
  notes: item.obs || null,
  photos: JSON.stringify(item.fotos || []),
  sourceDriveUrl: item.drive || null,
  sourcePage: item.pag || null,
  status: "available" as const,
  publicEnabled: 1,
})));
console.log(`seeded ${catalog.length} properties for organization ${organization.id}`);
