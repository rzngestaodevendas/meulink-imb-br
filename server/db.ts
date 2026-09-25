import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { AuditLog, auditLogs, InsertUser, organizationMembers, organizations, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

type D1DatabaseLike = Parameters<typeof drizzle>[0];
type PhotosBucket = { put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<unknown>; delete(key: string): Promise<unknown> };
let _db: ReturnType<typeof drizzle> | null = null;
let _passwordColumnReady = false;
let _organizationColumnsReady = false;
let _brokerProfileColumnsReady = false;
let _shareLinkColumnsReady = false;
let _responsibleProfilesReady = false;
let _propertyPrivateColumnsReady = false;
let _organizationPropertiesReady = false;
let _developmentsReady = false;

function getD1Binding(): D1DatabaseLike | undefined {
  return (globalThis as typeof globalThis & { __MEULINK_D1?: D1DatabaseLike }).__MEULINK_D1;
}

export function getPhotosBucket(): PhotosBucket | undefined {
  return (globalThis as typeof globalThis & { __MEULINK_PHOTOS?: PhotosBucket }).__MEULINK_PHOTOS;
}

export async function getDb() {
  if (!_db) {
    const binding = getD1Binding();
    if (binding) _db = drizzle(binding);
  }
  return _db;
}

export async function ensurePasswordColumn() {
  if (_passwordColumnReady) return;
  const binding = getD1Binding();
  if (!binding) throw new Error("Database is not available");
  try {
    await binding.prepare("ALTER TABLE users ADD COLUMN passwordHash TEXT").run();
  } catch (error) {
    if (!String(error).toLowerCase().includes("duplicate column")) throw error;
  }
  _passwordColumnReady = true;
}

export async function ensureOrganizationColumns() {
  if (_organizationColumnsReady) return;
  const binding = getD1Binding();
  if (!binding) throw new Error("Database is not available");
  const columns = [
    ["entityType", "TEXT NOT NULL DEFAULT 'construtora'"],
    ["catalogPeriod", "TEXT NOT NULL DEFAULT 'Setembro de 2026'"],
    ["logoUrl", "TEXT"],
    ["contactName", "TEXT"],
    ["contactPhone", "TEXT"],
    ["secondaryContactName", "TEXT"],
    ["secondaryContactPhone", "TEXT"],
    ["contactEmail", "TEXT"],
    ["contactAddress", "TEXT"],
    ["websiteUrl", "TEXT"],
    ["tableType", "TEXT NOT NULL DEFAULT 'third_party'"],
    ["developmentName", "TEXT"],
    ["developmentDescription", "TEXT"],
  ];
  for (const [name, type] of columns) {
    try {
      await binding.prepare(`ALTER TABLE organizations ADD COLUMN ${name} ${type}`).run();
    } catch (error) {
      if (!String(error).toLowerCase().includes("duplicate column")) throw error;
    }
  }
  _organizationColumnsReady = true;
}

export async function ensureBrokerProfileColumns() {
  if (_brokerProfileColumnsReady) return;
  const binding = getD1Binding();
  if (!binding) throw new Error("Database is not available");
  for (const [name, type] of [["profileType", "TEXT NOT NULL DEFAULT 'corretor'"], ["creci", "TEXT"], ["whatsapp", "TEXT"], ["profilePhotoUrl", "TEXT"]]) {
    try { await binding.prepare(`ALTER TABLE users ADD COLUMN ${name} ${type}`).run(); }
    catch (error) { if (!String(error).toLowerCase().includes("duplicate column")) throw error; }
  }
  _brokerProfileColumnsReady = true;
}

export async function ensureShareLinkColumns() {
  if (_shareLinkColumnsReady) return;
  const binding = getD1Binding();
  if (!binding) throw new Error("Database is not available");
  try { await binding.prepare("ALTER TABLE shareLinks ADD COLUMN brokerPhotoUrl TEXT").run(); }
  catch (error) { if (!String(error).toLowerCase().includes("duplicate column")) throw error; }
  _shareLinkColumnsReady = true;
}

export async function ensureResponsibleProfilesTable() {
  if (_responsibleProfilesReady) return;
  const binding = getD1Binding();
  if (!binding) throw new Error("Database is not available");
  await binding.prepare("CREATE TABLE IF NOT EXISTS responsibleProfiles (id INTEGER PRIMARY KEY AUTOINCREMENT, organizationId INTEGER NOT NULL, name TEXT NOT NULL, phone TEXT, email TEXT, creci TEXT, photoUrl TEXT, bio TEXT, createdAt INTEGER, updatedAt INTEGER)").run();
  _responsibleProfilesReady = true;
}

export async function ensureOrganizationPropertiesTable() {
  if (_organizationPropertiesReady) return;
  const binding = getD1Binding();
  if (!binding) throw new Error("Database is not available");
  await binding.prepare("CREATE TABLE IF NOT EXISTS organizationProperties (id INTEGER PRIMARY KEY AUTOINCREMENT, organizationId INTEGER NOT NULL, propertyId INTEGER NOT NULL, createdAt INTEGER, UNIQUE(organizationId, propertyId))").run();
  await binding.prepare("CREATE INDEX IF NOT EXISTS organization_property_organization_idx ON organizationProperties (organizationId)").run();
  await binding.prepare("CREATE INDEX IF NOT EXISTS organization_property_property_idx ON organizationProperties (propertyId)").run();
  await binding.prepare("ALTER TABLE organizationProperties ADD COLUMN responsibleName TEXT").run().catch(() => undefined);
  await binding.prepare("ALTER TABLE organizationProperties ADD COLUMN responsiblePhone TEXT").run().catch(() => undefined);
  _organizationPropertiesReady = true;
}

export async function ensureDevelopmentsTable() {
  if (_developmentsReady) return;
  const binding = getD1Binding();
  if (!binding) throw new Error("Database is not available");
  await binding.prepare("CREATE TABLE IF NOT EXISTS developments (id INTEGER PRIMARY KEY AUTOINCREMENT, organizationId INTEGER NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', photos TEXT NOT NULL DEFAULT '[]', details TEXT NOT NULL DEFAULT '[]', mapUrl TEXT, mapDriveUrl TEXT, photosDriveUrl TEXT, videosDriveUrl TEXT, createdAt INTEGER, updatedAt INTEGER)").run();
  await binding.prepare("CREATE INDEX IF NOT EXISTS development_organization_idx ON developments (organizationId)").run();
  await binding.prepare("ALTER TABLE properties ADD COLUMN developmentId INTEGER").run().catch(() => undefined);
  _developmentsReady = true;
}

export async function ensurePropertyPrivateColumns() {
  if (_propertyPrivateColumnsReady) return;
  const binding = getD1Binding();
  if (!binding) throw new Error("Database is not available");
  for (const [name, type] of [["commission", "TEXT"], ["paymentConditions", "TEXT"], ["bedrooms", "INTEGER"], ["suites", "INTEGER"], ["bathrooms", "INTEGER"], ["privateArea", "TEXT"], ["keys", "TEXT"], ["developmentInfo", "TEXT"], ["developmentId", "INTEGER"], ["mapUrl", "TEXT"], ["developmentName", "TEXT"], ["propertyType", "TEXT"], ["garageSpaces", "INTEGER"], ["unitNumber", "TEXT"], ["coverPhoto", "TEXT"], ["propertyPhotos", "TEXT"], ["developmentPhotos", "TEXT"], ["mapDriveUrl", "TEXT"], ["photosDriveUrl", "TEXT"], ["videosDriveUrl", "TEXT"]]) {
    try { await binding.prepare(`ALTER TABLE properties ADD COLUMN ${name} ${type}`).run(); }
    catch (error) { if (!String(error).toLowerCase().includes("duplicate column")) throw error; }
  }
  await binding.prepare("CREATE INDEX IF NOT EXISTS properties_public_status_idx ON properties (publicEnabled, status)").run();
  await binding.prepare("CREATE INDEX IF NOT EXISTS properties_organization_status_idx ON properties (organizationId, status, publicEnabled)").run();
  await binding.prepare("CREATE INDEX IF NOT EXISTS properties_responsible_idx ON properties (organizationId, responsibleName)").run();
  await binding.prepare("CREATE INDEX IF NOT EXISTS properties_development_idx ON properties (developmentId)").run();
  _propertyPrivateColumnsReady = true;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = values[field]; }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.openId, user.openId)).limit(1);
  if (existing[0]) await db.update(users).set(updateSet).where(eq(users.id, existing[0].id));
  else await db.insert(users).values(values);
}

export async function getUserByOpenId(openId: string) {
  await ensureBrokerProfileColumns();
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  await ensureBrokerProfileColumns();
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function setUserPasswordHash(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ passwordHash, loginMethod: "email" }).where(eq(users.id, userId));
}

export async function getOrganizationForUser(userId: number, openId: string, role: string, selectedOrganizationId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const memberWhere = selectedOrganizationId ? and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, selectedOrganizationId)) : eq(organizationMembers.userId, userId);
  const existing = await db.select({ organizationId: organizationMembers.organizationId, memberRole: organizationMembers.role, organization: organizations }).from(organizationMembers).innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id)).where(memberWhere).limit(1);
  if (existing[0]) return existing[0];
  if (role === "admin" || openId === ENV.ownerOpenId) {
    const [organization] = await db.select().from(organizations).where(eq(organizations.slug, "felipe-demo")).limit(1);
    if (!organization) return undefined;
    const member = await db.select({ id: organizationMembers.id }).from(organizationMembers).where(and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.userId, userId))).limit(1);
    if (member[0]) await db.update(organizationMembers).set({ role: "company_admin" }).where(eq(organizationMembers.id, member[0].id));
    else await db.insert(organizationMembers).values({ organizationId: organization.id, userId, role: "company_admin" });
    return { organizationId: organization.id, memberRole: "company_admin" as const, organization };
  }
  return undefined;
}

export async function getOrganizationMember(userId: number, organizationId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(organizationMembers).where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, organizationId))).limit(1);
  return result[0];
}

export async function writeAuditLog(input: Omit<AuditLog, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({ ...input, metadata: input.metadata ?? null });
}

export async function getAuditLogs(organizationId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, actorName: users.name, actorEmail: users.email }).from(auditLogs).innerJoin(users, eq(auditLogs.actorUserId, users.id)).where(eq(auditLogs.organizationId, organizationId)).orderBy(desc(auditLogs.createdAt)).limit(limit);
}
