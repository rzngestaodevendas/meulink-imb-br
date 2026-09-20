import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organizationInvites, organizationMembers, organizations, properties, shareLinks, users } from "../drizzle/schema";
import { ensureBrokerProfileColumns, ensureOrganizationColumns, ensurePasswordColumn, ensureShareLinkColumns, getAuditLogs, getDb, getOrganizationForUser, getPhotosBucket, getUserByEmail, writeAuditLog } from "./db";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { and, eq, isNull, like, or } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./_core/password";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";

const propertyInput = z.object({ search: z.string().trim().optional() });
const statusSchema = z.enum(["available", "reserved", "sold", "unavailable", "updating", "hidden"]);
export const propertyPayload = z.object({
  title: z.string().trim().min(2).max(240),
  address: z.string().trim().max(2000).optional().default(""),
  responsibleName: z.string().trim().max(180).optional().default(""),
  responsiblePhone: z.string().trim().max(32).optional().default(""),
  details: z.array(z.string().trim().min(1).max(240)).max(30),
  price: z.string().trim().max(80).optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
  photos: z.array(z.string().trim().url().or(z.string().trim().startsWith("/manus-storage/")).or(z.string().trim().startsWith("/media/"))).max(60),
  status: statusSchema,
  publicEnabled: z.boolean(),
});
export const bulkPropertyInput = z.object({ rows: propertyPayload.array().min(1).max(200) });
export const teamRoleSchema = z.enum(["company_admin", "broker"]);
export const inviteInput = z.object({ email: z.string().trim().email().max(320), role: teamRoleSchema });
export const auditActionSchema = z.enum(["organization.created", "organization.selected", "property.created", "property.bulk_created", "property.updated", "property.archived", "share_link.created", "team.invite_created", "team.invite_revoked", "team.invite_accepted", "team.role_updated", "team.member_removed"]);

function parseProperty(row: typeof properties.$inferSelect, includeInternal = true) {
  return {
    id: row.id,
    code: `ML-${String(row.id).padStart(6, "0")}`,
    slug: row.slug,
    title: row.title,
    address: row.address,
    ...(includeInternal ? { responsibleName: row.responsibleName, responsiblePhone: row.responsiblePhone } : {}),
    details: JSON.parse(row.details || "[]") as string[],
    price: row.price,
    notes: row.notes,
    photos: JSON.parse(row.photos || "[]") as string[],
    ...(includeInternal ? { sourceDriveUrl: row.sourceDriveUrl } : {}),
    status: row.status,
    publicEnabled: Boolean(row.publicEnabled),
  };
}

async function requireCompanyAdmin(ctx: { user: { id: number; openId: string; role: string; activeOrganizationId?: number | null } }) {
  await ensureOrganizationColumns();
  const scope = await getOrganizationForUser(ctx.user.id, ctx.user.openId, ctx.user.role, ctx.user.activeOrganizationId ?? undefined);
  if (!scope) throw new TRPCError({ code: "FORBIDDEN", message: "Sua conta ainda não está vinculada a uma empresa." });
  if (scope.memberRole !== "company_admin" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores da empresa podem gerenciar imóveis." });
  }
  return scope;
}

async function recordAudit(ctx: { user: { id: number } }, organizationId: number, action: z.infer<typeof auditActionSchema>, entityType: string, entityId?: number, metadata?: Record<string, unknown>) {
  await writeAuditLog({ organizationId, actorUserId: ctx.user.id, action, entityType, entityId: entityId ?? null, metadata: metadata ? JSON.stringify(metadata) : null });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    register: publicProcedure.input(z.object({ organizationId: z.number().int().positive(), name: z.string().trim().min(5).max(180), email: z.string().trim().email(), password: z.string().min(8).max(200), profileType: z.enum(["corretor", "corretora"]).default("corretor"), whatsapp: z.string().regex(/^\d{12,15}$/), creci: z.string().trim().min(2).max(40), profilePhotoUrl: z.string().trim().startsWith("/media/").optional().default("") })).mutation(async ({ ctx, input }) => {
      await ensurePasswordColumn(); await ensureBrokerProfileColumns();
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const email = input.email.toLowerCase();
      if (await getUserByEmail(email)) throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já possui cadastro. Use Entrar." });
      const [organization] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
      if (!organization) throw new TRPCError({ code: "NOT_FOUND", message: "Tabela não encontrada." });
      const openId = `broker:${email}`;
      await db.insert(users).values({ openId, name: input.name, email, passwordHash: await hashPassword(input.password), profileType: input.profileType, whatsapp: input.whatsapp, creci: input.creci, profilePhotoUrl: input.profilePhotoUrl || null, loginMethod: "email", role: "user" });
      const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar o cadastro." });
      await db.insert(organizationMembers).values({ organizationId: input.organizationId, userId: user.id, role: "broker" });
      await db.update(users).set({ activeOrganizationId: input.organizationId }).where(eq(users.id, user.id));
      const token = await sdk.createSessionToken(openId, { name: input.name });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 365 * 24 * 60 * 60 * 1000 });
      return { success: true as const };
    }),
    updateProfile: protectedProcedure.input(z.object({ name: z.string().trim().min(5).max(180), profileType: z.enum(["corretor", "corretora"]), whatsapp: z.string().regex(/^\d{12,15}$/), creci: z.string().trim().min(2).max(40), profilePhotoUrl: z.string().trim().startsWith("/media/").or(z.literal("")) })).mutation(async ({ ctx, input }) => { await ensureBrokerProfileColumns(); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" }); await db.update(users).set({ name: input.name, profileType: input.profileType, whatsapp: input.whatsapp, creci: input.creci, profilePhotoUrl: input.profilePhotoUrl || null }).where(eq(users.id, ctx.user.id)); return { success: true as const }; }),
    uploadProfilePhoto: protectedProcedure.input(z.object({ fileName: z.string().trim().min(1).max(160), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().min(100).max(12_000_000) })).mutation(async ({ ctx, input }) => { const bucket = getPhotosBucket(); if (!bucket) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Armazenamento de fotos indisponível." }); const encoded = input.data.includes(",") ? input.data.split(",", 2)[1] : input.data; const binary = atob(encoded); const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index); const safeName = input.fileName.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(-100) || "perfil.jpg"; const key = `brokers/${ctx.user.id}/${Date.now()}-${nanoid(8)}-${safeName}`; await bucket.put(key, bytes, { httpMetadata: { contentType: input.contentType, cacheControl: "public, max-age=31536000, immutable" } }); return { url: `/media/${key}` }; }),
    forgotPassword: publicProcedure.input(z.object({ email: z.string().trim().email() })).mutation(async () => ({ success: true as const, message: "Se o e-mail estiver cadastrado, o administrador da tabela deverá enviar uma nova senha." })),
    login: publicProcedure.input(z.object({ email: z.string().trim().email(), password: z.string().min(8).max(200) })).mutation(async ({ ctx, input }) => {
      await ensurePasswordColumn();
      const normalizedEmail = input.email.toLowerCase();
      let user = await getUserByEmail(normalizedEmail);
      const isConfiguredAdmin = Boolean(ENV.adminEmail && ENV.adminPassword && normalizedEmail === ENV.adminEmail.toLowerCase() && input.password === ENV.adminPassword);
      if (!user && isConfiguredAdmin) {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
        const passwordHash = await hashPassword(input.password);
        const openId = `email:${normalizedEmail}`;
        await db.insert(users).values({ openId, name: "Felipe", email: normalizedEmail, passwordHash, loginMethod: "email", role: "admin" });
        user = await getUserByEmail(normalizedEmail);
        const [organization] = await db.select().from(organizations).limit(1);
        if (user && organization) {
          await db.insert(organizationMembers).values({ organizationId: organization.id, userId: user.id, role: "company_admin" });
          await db.update(users).set({ activeOrganizationId: organization.id }).where(eq(users.id, user.id));
        }
      } else if (user && isConfiguredAdmin && !user.passwordHash) {
        const db = await getDb();
        if (db) {
          await db.update(users).set({ passwordHash: await hashPassword(input.password), loginMethod: "email", role: "admin" }).where(eq(users.id, user.id));
          user = await getUserByEmail(normalizedEmail);
        }
      }
      const valid = Boolean(user?.passwordHash && await verifyPassword(input.password, user.passwordHash));
      if (!user || !valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." });
      const token = await sdk.createSessionToken(user.openId, { name: user.name || user.email || "Usuário" });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 365 * 24 * 60 * 60 * 1000 });
      return { success: true as const };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  organizations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await ensureOrganizationColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const rows = ctx.user.role === "admin"
        ? await db.select().from(organizations).orderBy(organizations.name)
        : await db.select().from(organizationMembers).innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id)).where(eq(organizationMembers.userId, ctx.user.id)).then(items => items.map(row => row.organizations));
      return Promise.all(rows.map(async organization => {
        const availableProperties = await db.select().from(properties).where(and(eq(properties.organizationId, organization.id), eq(properties.status, "available"), eq(properties.publicEnabled, 1))).orderBy(properties.title);
        return { ...organization, availablePropertyCount: availableProperties.length, availableProperties: availableProperties.map(property => parseProperty(property)) };
      }));
    }),

    create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(180), publicName: z.string().trim().max(180).optional().default(""), logoUrl: z.string().trim().url().or(z.string().trim().startsWith("/media/")).or(z.literal("")), contactName: z.string().trim().max(180).optional().default(""), contactPhone: z.string().trim().max(32).optional().default(""), secondaryContactName: z.string().trim().max(180).optional().default(""), secondaryContactPhone: z.string().trim().max(32).optional().default(""), contactEmail: z.string().trim().email().or(z.literal("")), contactAddress: z.string().trim().max(500).optional().default(""), websiteUrl: z.string().trim().url().or(z.literal("")), tableType: z.enum(["third_party", "own_development"]), developmentName: z.string().trim().max(180).optional().default(""), developmentDescription: z.string().trim().max(2000).optional().default("") })).mutation(async ({ ctx, input }) => {
      await ensureOrganizationColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      if (ctx.user.role !== "admin") {
        const current = await getOrganizationForUser(ctx.user.id, ctx.user.openId, ctx.user.role, ctx.user.activeOrganizationId ?? undefined);
        if (!current || current.memberRole !== "company_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem cadastrar uma construtora." });
      }
      const slugBase = input.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "construtora";
      const slug = `${slugBase}-${nanoid(6).toLowerCase()}`;
      if (input.tableType === "own_development" && !input.developmentName) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o nome do empreendimento próprio." });
      await db.insert(organizations).values({ slug, name: input.name, publicName: input.publicName || input.name, logoUrl: input.logoUrl || null, contactName: input.contactName || null, contactPhone: input.contactPhone || null, secondaryContactName: input.secondaryContactName || null, secondaryContactPhone: input.secondaryContactPhone || null, contactEmail: input.contactEmail || null, contactAddress: input.contactAddress || null, websiteUrl: input.websiteUrl || null, tableType: input.tableType, developmentName: input.developmentName || null, developmentDescription: input.developmentDescription || null });
      const [createdOrganization] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
      if (!createdOrganization) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar a construtora." });
      const organizationId = createdOrganization.id;
      await db.insert(organizationMembers).values({ organizationId, userId: ctx.user.id, role: "company_admin" });
      await db.update(users).set({ activeOrganizationId: organizationId }).where(eq(users.id, ctx.user.id));
      await recordAudit(ctx, organizationId, "organization.created", "organization", organizationId, { name: input.name });
      return { id: organizationId, name: input.name, publicName: input.publicName || input.name };
    }),

    update: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), name: z.string().trim().min(2).max(180), publicName: z.string().trim().max(180), logoUrl: z.string().trim().url().or(z.string().trim().startsWith("/media/")).or(z.literal("")), contactName: z.string().trim().max(180), contactPhone: z.string().trim().max(32), secondaryContactName: z.string().trim().max(180), secondaryContactPhone: z.string().trim().max(32), contactEmail: z.string().trim().email().or(z.literal("")), contactAddress: z.string().trim().max(500), websiteUrl: z.string().trim().url().or(z.literal("")), tableType: z.enum(["third_party", "own_development"]), developmentName: z.string().trim().max(180), developmentDescription: z.string().trim().max(2000) })).mutation(async ({ ctx, input }) => { await ensureOrganizationColumns(); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" }); if (ctx.user.role !== "admin") await requireCompanyAdmin(ctx); await db.update(organizations).set({ name: input.name, publicName: input.publicName || input.name, logoUrl: input.logoUrl || null, contactName: input.contactName || null, contactPhone: input.contactPhone || null, secondaryContactName: input.secondaryContactName || null, secondaryContactPhone: input.secondaryContactPhone || null, contactEmail: input.contactEmail || null, contactAddress: input.contactAddress || null, websiteUrl: input.websiteUrl || null, tableType: input.tableType, developmentName: input.developmentName || null, developmentDescription: input.developmentDescription || null }).where(eq(organizations.id, input.organizationId)); return { success: true as const }; }),

    uploadLogo: protectedProcedure.input(z.object({ fileName: z.string().trim().min(1).max(160), contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]), data: z.string().min(100).max(12_000_000) })).mutation(async ({ ctx, input }) => { const bucket = getPhotosBucket(); if (!bucket) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Armazenamento indisponível." }); if (ctx.user.role !== "admin") await requireCompanyAdmin(ctx); const encoded = input.data.includes(",") ? input.data.split(",", 2)[1] : input.data; const binary = atob(encoded); const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index); const safeName = input.fileName.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(-100) || "logo.png"; const key = `organizations/${Date.now()}-${nanoid(8)}-${safeName}`; await bucket.put(key, bytes, { httpMetadata: { contentType: input.contentType, cacheControl: "public, max-age=31536000, immutable" } }); return { url: `/media/${key}` }; }),

    select: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await ensureOrganizationColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const [membership] = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user.id))).limit(1);
      if (!membership && ctx.user.role === "admin") await db.insert(organizationMembers).values({ organizationId: input.organizationId, userId: ctx.user.id, role: "company_admin" });
      else if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Você não pertence a esta construtora." });
      await db.update(users).set({ activeOrganizationId: input.organizationId }).where(eq(users.id, ctx.user.id));
      await recordAudit(ctx, input.organizationId, "organization.selected", "organization", input.organizationId);
      return { success: true as const };
    }),
  }),

  admin: router({
    users: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Esta área é exclusiva do administrador do painel." });
      await ensureBrokerProfileColumns(); await ensureOrganizationColumns();
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const rows = await db.select({ id: users.id, name: users.name, email: users.email, whatsapp: users.whatsapp, creci: users.creci, profilePhotoUrl: users.profilePhotoUrl, role: users.role, createdAt: users.createdAt, organizationId: organizationMembers.organizationId, organizationName: organizations.name, memberRole: organizationMembers.role }).from(users).leftJoin(organizationMembers, eq(organizationMembers.userId, users.id)).leftJoin(organizations, eq(organizationMembers.organizationId, organizations.id)).orderBy(users.createdAt);
      const grouped = new Map<number, { id: number; name: string | null; email: string | null; whatsapp: string | null; creci: string | null; profilePhotoUrl: string | null; role: string; createdAt: Date; organizations: { id: number; name: string; role: string }[] }>();
      for (const row of rows) { const current = grouped.get(row.id) || { id: row.id, name: row.name, email: row.email, whatsapp: row.whatsapp, creci: row.creci, profilePhotoUrl: row.profilePhotoUrl, role: row.role, createdAt: row.createdAt, organizations: [] }; if (row.organizationId && row.organizationName) current.organizations.push({ id: row.organizationId, name: row.organizationName, role: row.memberRole || "broker" }); grouped.set(row.id, current); }
      return Array.from(grouped.values());
    }),
  }),

  catalog: router({
    list: protectedProcedure.input(propertyInput.optional()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const search = input?.search?.trim();
      const where = search
        ? and(eq(properties.organizationId, scope.organizationId), or(like(properties.title, `%${search}%`), like(properties.address, `%${search}%`), like(properties.price, `%${search}%`)))
        : eq(properties.organizationId, scope.organizationId);
      const rows = await db.select().from(properties).where(where).orderBy(properties.title);
      return rows.map(row => parseProperty(row));
    }),

    createLink: protectedProcedure.input(z.object({ propertyId: z.number(), organizationId: z.number().int().positive().optional(), brokerName: z.string().trim().min(3).max(180), brokerPhone: z.string().regex(/^\d{12,15}$/), brokerPhotoUrl: z.string().trim().startsWith("/media/").or(z.literal("")).optional().default("") })).mutation(async ({ ctx, input }) => {
      await ensureShareLinkColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await getOrganizationForUser(ctx.user.id, ctx.user.openId, ctx.user.role, input.organizationId ?? ctx.user.activeOrganizationId ?? undefined);
      if (!scope) throw new TRPCError({ code: "FORBIDDEN", message: "Sua conta ainda não está vinculada a uma empresa." });
      const [property] = await db.select().from(properties).where(and(eq(properties.id, input.propertyId), eq(properties.organizationId, scope.organizationId))).limit(1);
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Imóvel não encontrado" });
      if (property.status !== "available" || !property.publicEnabled) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Este imóvel não está disponível para divulgação." });
      const token = nanoid(24);
      await db.insert(shareLinks).values({ organizationId: scope.organizationId, propertyId: property.id, token, brokerName: input.brokerName, brokerPhone: input.brokerPhone, brokerPhotoUrl: input.brokerPhotoUrl || null, createdBy: ctx.user.id });
      await recordAudit(ctx, scope.organizationId, "share_link.created", "share_link", undefined, { propertyId: property.id, brokerName: input.brokerName });
      return { token, property: parseProperty(property), profileType: ctx.user.profileType === "corretora" ? "corretora" : "corretor", brokerSlug: input.brokerName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) };
    }),

    publicLink: publicProcedure.input(z.object({ token: z.string().trim().min(8).max(80) })).query(async ({ input }) => {
      await ensureShareLinkColumns();
      await ensureOrganizationColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const [link] = await db.select({ link: shareLinks, property: properties, organization: organizations }).from(shareLinks).innerJoin(properties, eq(shareLinks.propertyId, properties.id)).innerJoin(organizations, eq(shareLinks.organizationId, organizations.id)).where(and(eq(shareLinks.token, input.token), eq(shareLinks.enabled, 1), eq(properties.publicEnabled, 1), eq(properties.status, "available"))).limit(1);
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Link de imóvel inválido ou expirado" });
      return { property: parseProperty(link.property, false), broker: { name: link.link.brokerName, phone: link.link.brokerPhone, photoUrl: link.link.brokerPhotoUrl }, organization: { name: link.organization.publicName || link.organization.name, logoUrl: link.organization.logoUrl, contactName: link.organization.contactName, contactPhone: link.organization.contactPhone, tableType: link.organization.tableType, developmentName: link.organization.developmentName } };
    }),
  }),

  portal: router({
    info: publicProcedure.input(z.object({ slug: z.string().trim().min(2).max(120) })).query(async ({ input }) => { await ensureOrganizationColumns(); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" }); const [organization] = await db.select().from(organizations).where(eq(organizations.slug, input.slug)).limit(1); if (!organization) throw new TRPCError({ code: "NOT_FOUND", message: "Tabela não encontrada." }); return { id: organization.id, name: organization.name, publicName: organization.publicName, logoUrl: organization.logoUrl, tableType: organization.tableType, developmentName: organization.developmentName }; }),
    catalog: protectedProcedure.input(z.object({ slug: z.string().trim().min(2).max(120) })).query(async ({ ctx, input }) => {
      await ensureOrganizationColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const [organization] = await db.select().from(organizations).where(eq(organizations.slug, input.slug)).limit(1);
      if (!organization) throw new TRPCError({ code: "NOT_FOUND", message: "Tabela não encontrada." });
      const [membership] = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.userId, ctx.user.id))).limit(1);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Sua conta não tem acesso a esta tabela." });
      const rows = await db.select().from(properties).where(and(eq(properties.organizationId, organization.id), eq(properties.status, "available"), eq(properties.publicEnabled, 1))).orderBy(properties.title);
      return { organization: { id: organization.id, slug: organization.slug, name: organization.name, publicName: organization.publicName, logoUrl: organization.logoUrl, contactName: organization.contactName, contactPhone: organization.contactPhone, tableType: organization.tableType, developmentName: organization.developmentName, developmentDescription: organization.developmentDescription }, memberRole: membership.role, properties: rows.map(row => parseProperty(row, true)) };
    }),
  }),

  properties: router({
    uploadPhoto: protectedProcedure.input(z.object({ fileName: z.string().trim().min(1).max(160), contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]), data: z.string().min(100).max(12_000_000) })).mutation(async ({ ctx, input }) => {
      const scope = await requireCompanyAdmin(ctx);
      const bucket = getPhotosBucket();
      if (!bucket) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Armazenamento de fotos indisponível." });
      const encoded = input.data.includes(",") ? input.data.split(",", 2)[1] : input.data;
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      const safeName = input.fileName.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(-100) || "foto.jpg";
      const key = `properties/${scope.organizationId}/${Date.now()}-${nanoid(8)}-${safeName}`;
      await bucket.put(key, bytes, { httpMetadata: { contentType: input.contentType, cacheControl: "public, max-age=31536000, immutable" } });
      return { url: `/media/${key}` };
    }),
    create: protectedProcedure.input(propertyPayload).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const baseSlug = input.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 150) || `imovel-${nanoid(8)}`;
      const slug = `${baseSlug}-${nanoid(5).toLowerCase()}`;
      await db.insert(properties).values({ organizationId: scope.organizationId, slug, title: input.title, address: input.address, responsibleName: input.responsibleName, responsiblePhone: input.responsiblePhone, details: JSON.stringify(input.details), price: input.price, notes: input.notes, photos: JSON.stringify(input.photos), status: input.status, publicEnabled: input.publicEnabled ? 1 : 0 });
      const [created] = await db.select().from(properties).where(and(eq(properties.organizationId, scope.organizationId), eq(properties.slug, slug))).limit(1);
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível carregar o imóvel criado." });
      await recordAudit(ctx, scope.organizationId, "property.created", "property", created.id, { title: created.title });
      return parseProperty(created);
    }),

    bulkCreate: protectedProcedure.input(bulkPropertyInput).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const values = input.rows.map(row => {
        const baseSlug = row.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 150) || `imovel-${nanoid(8)}`;
        return { organizationId: scope.organizationId, slug: `${baseSlug}-${nanoid(5).toLowerCase()}`, title: row.title, address: row.address, responsibleName: row.responsibleName, responsiblePhone: row.responsiblePhone, details: JSON.stringify(row.details), price: row.price, notes: row.notes, photos: JSON.stringify(row.photos), status: row.status, publicEnabled: row.publicEnabled ? 1 : 0 };
      });
      await db.insert(properties).values(values);
      await recordAudit(ctx, scope.organizationId, "property.bulk_created", "property", undefined, { count: values.length });
      return { success: true as const, count: values.length };
    }),

    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), data: propertyPayload })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const [existing] = await db.select().from(properties).where(and(eq(properties.id, input.id), eq(properties.organizationId, scope.organizationId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Imóvel não encontrado." });
      await db.update(properties).set({ title: input.data.title, address: input.data.address, responsibleName: input.data.responsibleName, responsiblePhone: input.data.responsiblePhone, details: JSON.stringify(input.data.details), price: input.data.price, notes: input.data.notes, photos: JSON.stringify(input.data.photos), status: input.data.status, publicEnabled: input.data.publicEnabled ? 1 : 0 }).where(eq(properties.id, input.id));
      const [updated] = await db.select().from(properties).where(eq(properties.id, input.id)).limit(1);
      await recordAudit(ctx, scope.organizationId, "property.updated", "property", input.id, { title: input.data.title, status: input.data.status });
      return parseProperty(updated!);
    }),

    archive: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const [existing] = await db.select().from(properties).where(and(eq(properties.id, input.id), eq(properties.organizationId, scope.organizationId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Imóvel não encontrado." });
      await db.update(properties).set({ status: "hidden", publicEnabled: 0 }).where(eq(properties.id, input.id));
      await recordAudit(ctx, scope.organizationId, "property.archived", "property", input.id, { title: existing.title });
      return { success: true as const };
    }),
  }),

  audit: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const scope = await requireCompanyAdmin(ctx);
      return getAuditLogs(scope.organizationId);
    }),
  }),

  team: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const rows = await db.select({ memberId: organizationMembers.id, userId: users.id, name: users.name, email: users.email, role: organizationMembers.role, createdAt: organizationMembers.createdAt })
        .from(organizationMembers)
        .innerJoin(users, eq(organizationMembers.userId, users.id))
        .where(eq(organizationMembers.organizationId, scope.organizationId));
      return rows;
    }),

    createInvite: protectedProcedure.input(inviteInput).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const email = input.email.toLowerCase();
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) {
        const [member] = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, scope.organizationId), eq(organizationMembers.userId, existing.id))).limit(1);
        if (member) throw new TRPCError({ code: "CONFLICT", message: "Este usuário já faz parte da equipe." });
      }
      const token = nanoid(32);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(organizationInvites).values({ organizationId: scope.organizationId, email, role: input.role, token, invitedBy: ctx.user.id, expiresAt });
      await recordAudit(ctx, scope.organizationId, "team.invite_created", "invite", undefined, { email, role: input.role });
      return { token, email, role: input.role, expiresAt };
    }),

    listInvites: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      return db.select({ id: organizationInvites.id, email: organizationInvites.email, role: organizationInvites.role, token: organizationInvites.token, expiresAt: organizationInvites.expiresAt, createdAt: organizationInvites.createdAt })
        .from(organizationInvites)
        .where(and(eq(organizationInvites.organizationId, scope.organizationId), isNull(organizationInvites.acceptedAt), isNull(organizationInvites.revokedAt)))
        .orderBy(organizationInvites.createdAt);
    }),

    revokeInvite: protectedProcedure.input(z.object({ inviteId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const [invite] = await db.select().from(organizationInvites).where(and(eq(organizationInvites.id, input.inviteId), eq(organizationInvites.organizationId, scope.organizationId), isNull(organizationInvites.acceptedAt), isNull(organizationInvites.revokedAt))).limit(1);
      if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Convite não encontrado ou já encerrado." });
      await db.update(organizationInvites).set({ revokedAt: new Date() }).where(eq(organizationInvites.id, invite.id));
      await recordAudit(ctx, scope.organizationId, "team.invite_revoked", "invite", invite.id, { email: invite.email });
      return { success: true as const };
    }),

    acceptInvite: protectedProcedure.input(z.object({ token: z.string().trim().min(16).max(80) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      if (!ctx.user.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Sua conta não possui e-mail para validar este convite." });
      const [invite] = await db.select().from(organizationInvites).where(eq(organizationInvites.token, input.token)).limit(1);
      if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt.getTime() <= Date.now()) throw new TRPCError({ code: "NOT_FOUND", message: "Convite inválido, expirado ou revogado." });
      if (invite.email.toLowerCase() !== ctx.user.email.toLowerCase()) throw new TRPCError({ code: "FORBIDDEN", message: "Este convite foi enviado para outro e-mail." });
      const [existing] = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, invite.organizationId), eq(organizationMembers.userId, ctx.user.id))).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Sua conta já faz parte desta organização." });
      await db.insert(organizationMembers).values({ organizationId: invite.organizationId, userId: ctx.user.id, role: invite.role });
      await db.update(organizationInvites).set({ acceptedAt: new Date() }).where(eq(organizationInvites.id, invite.id));
      await recordAudit(ctx, invite.organizationId, "team.invite_accepted", "invite", invite.id, { role: invite.role });
      return { success: true as const, organizationId: invite.organizationId };
    }),

    updateRole: protectedProcedure.input(z.object({ memberId: z.number().int().positive(), role: teamRoleSchema })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const [member] = await db.select().from(organizationMembers).where(and(eq(organizationMembers.id, input.memberId), eq(organizationMembers.organizationId, scope.organizationId))).limit(1);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Membro não encontrado." });
      if (member.userId === ctx.user.id && input.role === "broker") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Você não pode remover sua própria permissão de administrador." });
      if (member.role === "company_admin" && input.role === "broker") {
        const admins = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, scope.organizationId), eq(organizationMembers.role, "company_admin")));
        if (admins.length <= 1) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A organização precisa manter pelo menos um administrador." });
      }
      await db.update(organizationMembers).set({ role: input.role }).where(eq(organizationMembers.id, member.id));
      await recordAudit(ctx, scope.organizationId, "team.role_updated", "member", member.id, { userId: member.userId, from: member.role, to: input.role });
      return { success: true as const };
    }),

    remove: protectedProcedure.input(z.object({ memberId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const [member] = await db.select().from(organizationMembers).where(and(eq(organizationMembers.id, input.memberId), eq(organizationMembers.organizationId, scope.organizationId))).limit(1);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Membro não encontrado." });
      if (member.userId === ctx.user.id) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Você não pode remover a própria conta da organização." });
      if (member.role === "company_admin") {
        const admins = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, scope.organizationId), eq(organizationMembers.role, "company_admin")));
        if (admins.length <= 1) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A organização precisa manter pelo menos um administrador." });
      }
      await db.delete(organizationMembers).where(eq(organizationMembers.id, member.id));
      await recordAudit(ctx, scope.organizationId, "team.member_removed", "member", member.id, { userId: member.userId, role: member.role });
      return { success: true as const };
    }),
  }),
});

export type AppRouter = typeof appRouter;
