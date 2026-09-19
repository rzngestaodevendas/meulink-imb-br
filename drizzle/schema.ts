import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);
const nullableTimestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  passwordHash: text("passwordHash"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  activeOrganizationId: integer("activeOrganizationId"),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
  lastSignedIn: timestamp("lastSignedIn"),
});

export const organizations = sqliteTable("organizations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  publicName: text("publicName"),
  logoUrl: text("logoUrl"),
  contactName: text("contactName"),
  contactPhone: text("contactPhone"),
  tableType: text("tableType", { enum: ["third_party", "own_development"] }).notNull().default("third_party"),
  developmentName: text("developmentName"),
  developmentDescription: text("developmentDescription"),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

export const organizationMembers = sqliteTable("organizationMembers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organizationId").notNull(),
  userId: integer("userId").notNull(),
  role: text("role", { enum: ["company_admin", "broker"] }).notNull().default("broker"),
  createdAt: timestamp("createdAt"),
}, table => ({
  organizationUserUnique: uniqueIndex("organization_user_unique").on(table.organizationId, table.userId),
  userIndex: index("organization_member_user_idx").on(table.userId),
}));

export const organizationInvites = sqliteTable("organizationInvites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organizationId").notNull(),
  email: text("email").notNull(),
  role: text("role", { enum: ["company_admin", "broker"] }).notNull().default("broker"),
  token: text("token").notNull().unique(),
  invitedBy: integer("invitedBy").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  acceptedAt: nullableTimestamp("acceptedAt"),
  revokedAt: nullableTimestamp("revokedAt"),
  createdAt: timestamp("createdAt"),
}, table => ({
  organizationIndex: index("organization_invite_organization_idx").on(table.organizationId),
  emailIndex: index("organization_invite_email_idx").on(table.email),
}));

export const auditLogs = sqliteTable("auditLogs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organizationId").notNull(),
  actorUserId: integer("actorUserId").notNull(),
  action: text("action").notNull(),
  entityType: text("entityType").notNull(),
  entityId: integer("entityId"),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt"),
}, table => ({
  organizationIndex: index("audit_log_organization_idx").on(table.organizationId),
  createdIndex: index("audit_log_created_idx").on(table.createdAt),
}));

export const properties = sqliteTable("properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organizationId").notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  address: text("address"),
  responsibleName: text("responsibleName"),
  responsiblePhone: text("responsiblePhone"),
  details: text("details").notNull(),
  price: text("price"),
  notes: text("notes"),
  photos: text("photos").notNull(),
  sourceDriveUrl: text("sourceDriveUrl"),
  sourcePage: integer("sourcePage"),
  status: text("status", { enum: ["available", "reserved", "sold", "unavailable", "updating", "hidden"] }).notNull().default("available"),
  publicEnabled: integer("publicEnabled").notNull().default(1),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
}, table => ({
  organizationSlugUnique: uniqueIndex("organization_property_slug_unique").on(table.organizationId, table.slug),
  organizationIndex: index("property_organization_idx").on(table.organizationId),
}));

export const shareLinks = sqliteTable("shareLinks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organizationId").notNull(),
  propertyId: integer("propertyId").notNull(),
  token: text("token").notNull().unique(),
  brokerName: text("brokerName").notNull(),
  brokerPhone: text("brokerPhone").notNull(),
  enabled: integer("enabled").notNull().default(1),
  clickCount: integer("clickCount").notNull().default(0),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt"),
  disabledAt: nullableTimestamp("disabledAt"),
}, table => ({
  organizationIndex: index("share_link_organization_idx").on(table.organizationId),
  propertyIndex: index("share_link_property_idx").on(table.propertyId),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type OrganizationInvite = typeof organizationInvites.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type ShareLink = typeof shareLinks.$inferSelect;
