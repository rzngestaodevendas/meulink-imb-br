import { and, eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { organizations, shareLinks } from "../drizzle/schema";

const db = await getDb();
if (!db) throw new Error("DATABASE_URL indisponível");
const [org] = await db.select().from(organizations).where(eq(organizations.slug, "atlantida-negocios-imobiliarios")).limit(1);
if (!org) throw new Error("Organização Atlântida não encontrada");
const result = await db.update(shareLinks).set({ enabled: 0, disabledAt: new Date() }).where(and(eq(shareLinks.organizationId, org.id), eq(shareLinks.enabled, 1)));
console.log(JSON.stringify({ organizationId: org.id, revoked: Number(result[0]?.affectedRows ?? 0) }));
