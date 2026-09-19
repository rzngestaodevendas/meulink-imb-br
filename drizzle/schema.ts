import { int, mysqlEnum, mysqlTable, text, timestamp, tinyint, uniqueIndex, varchar, index } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  activeOrganizationId: int("activeOrganizationId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  publicName: varchar("publicName", { length: 180 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const organizationMembers = mysqlTable("organizationMembers", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["company_admin", "broker"]).default("broker").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  organizationUserUnique: uniqueIndex("organization_user_unique").on(table.organizationId, table.userId),
  userIndex: index("organization_member_user_idx").on(table.userId),
}));

export const organizationInvites = mysqlTable("organizationInvites", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["company_admin", "broker"]).default("broker").notNull(),
  token: varchar("token", { length: 80 }).notNull().unique(),
  invitedBy: int("invitedBy").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  organizationIndex: index("organization_invite_organization_idx").on(table.organizationId),
  emailIndex: index("organization_invite_email_idx").on(table.email),
}));

export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  actorUserId: int("actorUserId").notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: int("entityId"),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  organizationIndex: index("audit_log_organization_idx").on(table.organizationId),
  createdIndex: index("audit_log_created_idx").on(table.createdAt),
}));

export const properties = mysqlTable("properties", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  slug: varchar("slug", { length: 180 }).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  address: text("address"),
  responsibleName: varchar("responsibleName", { length: 180 }),
  responsiblePhone: varchar("responsiblePhone", { length: 32 }),
  details: text("details").notNull(),
  price: varchar("price", { length: 80 }),
  notes: text("notes"),
  photos: text("photos").notNull(),
  sourceDriveUrl: text("sourceDriveUrl"),
  sourcePage: int("sourcePage"),
  status: mysqlEnum("status", ["available", "reserved", "sold", "unavailable", "updating", "hidden"]).default("available").notNull(),
  publicEnabled: tinyint("publicEnabled").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  organizationSlugUnique: uniqueIndex("organization_property_slug_unique").on(table.organizationId, table.slug),
  organizationIndex: index("property_organization_idx").on(table.organizationId),
}));

export const shareLinks = mysqlTable("shareLinks", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  propertyId: int("propertyId").notNull(),
  token: varchar("token", { length: 80 }).notNull().unique(),
  brokerName: varchar("brokerName", { length: 180 }).notNull(),
  brokerPhone: varchar("brokerPhone", { length: 32 }).notNull(),
  enabled: tinyint("enabled").default(1).notNull(),
  clickCount: int("clickCount").default(0).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  disabledAt: timestamp("disabledAt"),
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
