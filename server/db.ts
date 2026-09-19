import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { AuditLog, auditLogs, InsertUser, organizationMembers, organizations, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getOrganizationForUser(userId: number, openId: string, role: string, selectedOrganizationId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const memberWhere = selectedOrganizationId
    ? and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, selectedOrganizationId))
    : eq(organizationMembers.userId, userId);
  const existing = await db.select({
    organizationId: organizationMembers.organizationId,
    memberRole: organizationMembers.role,
    organization: organizations,
  }).from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(memberWhere).limit(1);
  if (existing[0]) return existing[0];

  // The initial account owner is provisioned into the demo organization once.
  if (role === "admin" || openId === ENV.ownerOpenId) {
    const [organization] = await db.select().from(organizations).where(eq(organizations.slug, "felipe-demo")).limit(1);
    if (!organization) return undefined;
    await db.insert(organizationMembers).values({ organizationId: organization.id, userId, role: "company_admin" }).onDuplicateKeyUpdate({ set: { role: "company_admin" } });
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
  return db.select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, actorName: users.name, actorEmail: users.email })
    .from(auditLogs)
    .innerJoin(users, eq(auditLogs.actorUserId, users.id))
    .where(eq(auditLogs.organizationId, organizationId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
