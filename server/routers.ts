import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { auditLogs, developments, organizationInvites, organizationMembers, organizationProperties, organizations, properties, responsibleProfiles, shareLinks, users } from "../drizzle/schema";
import { ensureBrokerProfileColumns, ensureDevelopmentsTable, ensureOrganizationColumns, ensureOrganizationPropertiesTable, ensurePasswordColumn, ensurePropertyPrivateColumns, ensureResponsibleProfilesTable, ensureShareLinkColumns, getAuditLogs, getDb, getOrganizationForUser, getPhotosBucket, getUserByEmail, writeAuditLog } from "./db";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { and, eq, inArray, isNull, like, or } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./_core/password";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";

const propertyInput = z.object({ search: z.string().trim().optional() });
const statusSchema = z.enum(["available", "reserved", "sold", "unavailable", "updating", "hidden"]);
export const propertyPayload = z.object({
  developmentId: z.number().int().positive().nullable().optional().default(null),
  title: z.string().trim().min(2).max(240),
  address: z.string().trim().max(2000).optional().default(""),
  developmentName: z.string().trim().max(240).optional().default(""),
  propertyType: z.enum(["Apartamento", "Casa térrea", "Sobrado", "Loja", "Lote", "Área de terra", "Pavilhão industrial", "Pavilhão comercial", "Loja comercial", "Sítio", "Loft"]).optional().default("Apartamento"),
  garageSpaces: z.number().int().min(0).max(99).nullable().optional().default(null),
  unitNumber: z.string().trim().max(80).optional().default(""),
  bedrooms: z.number().int().min(0).max(99).nullable().optional().default(null),
  suites: z.number().int().min(0).max(99).nullable().optional().default(null),
  bathrooms: z.number().int().min(0).max(99).nullable().optional().default(null),
  privateArea: z.string().trim().max(80).optional().default(""),
  keys: z.string().trim().max(240).optional().default(""),
  developmentInfo: z.string().optional().default(""),
  mapUrl: z.string().trim().url().or(z.literal("")).optional().default(""),
  responsibleName: z.string().trim().max(180).optional().default(""),
  responsiblePhone: z.string().trim().max(32).optional().default(""),
  details: z.array(z.string().trim().min(1).max(240)).max(30),
  price: z.string().trim().max(80).optional().default(""),
  commission: z.string().trim().max(120).optional().default(""),
  paymentConditions: z.string().trim().max(500).optional().default(""),
  notes: z.string().optional().default(""),
  photos: z.array(z.string().trim().url().or(z.string().trim().startsWith("/manus-storage/")).or(z.string().trim().startsWith("/media/"))).max(60),
  coverPhoto: z.string().trim().url().or(z.string().trim().startsWith("/manus-storage/")).or(z.string().trim().startsWith("/media/")).or(z.literal("")).optional().default(""),
  propertyPhotos: z.array(z.string().trim().url().or(z.string().trim().startsWith("/manus-storage/")).or(z.string().trim().startsWith("/media/"))).max(60).optional().default([]),
  developmentPhotos: z.array(z.string().trim().url().or(z.string().trim().startsWith("/manus-storage/")).or(z.string().trim().startsWith("/media/"))).max(60).optional().default([]),
  mapDriveUrl: z.string().trim().url().or(z.literal("")).optional().default(""),
  photosDriveUrl: z.string().trim().url().or(z.literal("")).optional().default(""),
  videosDriveUrl: z.string().trim().url().or(z.literal("")).optional().default(""),
  status: statusSchema,
  publicEnabled: z.boolean(),
});
export const bulkPropertyInput = z.object({ rows: propertyPayload.array().min(1).max(200) });
export const teamRoleSchema = z.enum(["company_admin", "broker"]);
export const inviteInput = z.object({ email: z.string().trim().email().max(320), role: teamRoleSchema });
export const auditActionSchema = z.enum(["organization.created", "organization.selected", "organization.properties_linked", "property.created", "property.bulk_created", "property.updated", "property.archived", "property.deleted_permanently", "share_link.created", "team.invite_created", "team.invite_revoked", "team.invite_accepted", "team.role_updated", "team.member_removed"]);

function parseProperty(row: typeof properties.$inferSelect, includeInternal = true) {
  const legacyPhotos = JSON.parse(row.photos || "[]") as string[];
  const storedPropertyPhotos = JSON.parse(row.propertyPhotos || "[]") as string[];
  return {
    id: row.id,
    code: `ML-${String(row.id).padStart(6, "0")}`,
    slug: row.slug,
    developmentId: row.developmentId,
    title: row.title,
    address: row.address,
    developmentName: row.developmentName,
    propertyType: row.propertyType || "Apartamento",
    garageSpaces: row.garageSpaces,
    ...(includeInternal ? { unitNumber: row.unitNumber } : {}),
    bedrooms: row.bedrooms,
    suites: row.suites,
    bathrooms: row.bathrooms,
    privateArea: row.privateArea,
    keys: row.keys,
    developmentInfo: row.developmentInfo,
    mapUrl: row.mapUrl,
    ...(includeInternal ? { responsibleName: row.responsibleName, responsiblePhone: row.responsiblePhone } : {}),
    details: JSON.parse(row.details || "[]") as string[],
    price: row.price,
    ...(includeInternal ? { commission: row.commission, paymentConditions: row.paymentConditions } : {}),
    notes: row.notes,
    photos: legacyPhotos,
    coverPhoto: row.coverPhoto || legacyPhotos[0] || "",
    propertyPhotos: storedPropertyPhotos.length ? storedPropertyPhotos : legacyPhotos.slice(1),
    developmentPhotos: JSON.parse(row.developmentPhotos || "[]") as string[],
    ...(includeInternal ? { sourceDriveUrl: row.sourceDriveUrl } : {}),
    mapDriveUrl: row.mapDriveUrl,
    photosDriveUrl: row.photosDriveUrl,
    videosDriveUrl: row.videosDriveUrl,
    status: row.status,
    publicEnabled: Boolean(row.publicEnabled),
  };
}

function parseCatalogProperty(row: typeof properties.$inferSelect) {
  const property = parseProperty(row, true);
  return { ...property, notes: null, details: [], developmentInfo: null, photos: property.coverPhoto ? [property.coverPhoto] : (property.photos[0] ? [property.photos[0]] : []), propertyPhotos: [], developmentPhotos: [] };
}

async function getPropertiesForOrganization(db: Awaited<ReturnType<typeof getDb>>, organizationId: number) {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
  await ensureOrganizationPropertiesTable();
  const owned = await db.select().from(properties).where(eq(properties.organizationId, organizationId));
  const links = await db.select({ propertyId: organizationProperties.propertyId }).from(organizationProperties).where(eq(organizationProperties.organizationId, organizationId));
  const linkedIds = links.map(link => link.propertyId).filter(id => !owned.some(property => property.id === id));
  if (!linkedIds.length) return owned;
  const linked = await db.select().from(properties).where(inArray(properties.id, linkedIds));
  return [...owned, ...linked];
}

async function propertyBelongsToOrganization(db: Awaited<ReturnType<typeof getDb>>, organizationId: number, propertyId: number) {
  if (!db) return false;
  const [owned] = await db.select({ id: properties.id }).from(properties).where(and(eq(properties.id, propertyId), eq(properties.organizationId, organizationId))).limit(1);
  if (owned) return true;
  const [linked] = await db.select({ id: organizationProperties.id }).from(organizationProperties).where(and(eq(organizationProperties.organizationId, organizationId), eq(organizationProperties.propertyId, propertyId))).limit(1);
  return Boolean(linked);
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
    register: publicProcedure.input(z.object({ organizationId: z.number().int().positive(), name: z.string().trim().min(5).max(180), email: z.string().trim().email(), password: z.string().min(8).max(200), profileType: z.enum(["corretor", "corretora"]).default("corretor"), whatsapp: z.string().regex(/^\d{12,15}$/), creci: z.string().trim().min(2).max(40), profilePhotoUrl: z.string().trim().startsWith("/media/") })).mutation(async ({ ctx, input }) => {
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
    uploadRegistrationPhoto: publicProcedure.input(z.object({ fileName: z.string().trim().min(1).max(160), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().min(100).max(12_000_000) })).mutation(async ({ input }) => { const bucket = getPhotosBucket(); if (!bucket) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Armazenamento de fotos indisponível." }); const encoded = input.data.includes(",") ? input.data.split(",", 2)[1] : input.data; const binary = atob(encoded); const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index); const safeName = input.fileName.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(-100) || "perfil.jpg"; const key = `broker-registrations/${Date.now()}-${nanoid(12)}-${safeName}`; await bucket.put(key, bytes, { httpMetadata: { contentType: input.contentType, cacheControl: "public, max-age=31536000, immutable" } }); return { url: `/media/${key}` }; }),
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

  developments: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await ensureDevelopmentsTable();
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const rows = await db.select().from(developments).where(eq(developments.organizationId, scope.organizationId)).orderBy(developments.name);
      return rows.map(row => ({ ...row, photos: JSON.parse(row.photos || "[]") as string[], details: JSON.parse(row.details || "[]") as string[] }));
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(240), description: z.string().max(10000).default(""), photos: z.array(z.string().trim().min(1).max(1000)).max(60).default([]), details: z.array(z.string().trim().min(1).max(240)).max(60).default([]), mapUrl: z.string().trim().url().or(z.literal("")).default(""), mapDriveUrl: z.string().trim().url().or(z.literal("")).default(""), photosDriveUrl: z.string().trim().url().or(z.literal("")).default(""), videosDriveUrl: z.string().trim().url().or(z.literal("")).default("") })).mutation(async ({ ctx, input }) => {
      await ensureDevelopmentsTable(); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" }); const scope = await requireCompanyAdmin(ctx);
      const [row] = await db.insert(developments).values({ organizationId: scope.organizationId, name: input.name, description: input.description, photos: JSON.stringify(input.photos), details: JSON.stringify(input.details), mapUrl: input.mapUrl || null, mapDriveUrl: input.mapDriveUrl || null, photosDriveUrl: input.photosDriveUrl || null, videosDriveUrl: input.videosDriveUrl || null }).returning();
      return { ...row, photos: input.photos, details: input.details };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), data: z.object({ name: z.string().trim().min(2).max(240), description: z.string().max(10000).default(""), photos: z.array(z.string().trim().min(1).max(1000)).max(60).default([]), details: z.array(z.string().trim().min(1).max(240)).max(60).default([]), mapUrl: z.string().trim().url().or(z.literal("")).default(""), mapDriveUrl: z.string().trim().url().or(z.literal("")).default(""), photosDriveUrl: z.string().trim().url().or(z.literal("")).default(""), videosDriveUrl: z.string().trim().url().or(z.literal("")).default("") }) })).mutation(async ({ ctx, input }) => {
      await ensureDevelopmentsTable(); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" }); const scope = await requireCompanyAdmin(ctx);
      const [existing] = await db.select().from(developments).where(and(eq(developments.id, input.id), eq(developments.organizationId, scope.organizationId))).limit(1); if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Empreendimento não encontrado." });
      await db.update(developments).set({ name: input.data.name, description: input.data.description, photos: JSON.stringify(input.data.photos), details: JSON.stringify(input.data.details), mapUrl: input.data.mapUrl || null, mapDriveUrl: input.data.mapDriveUrl || null, photosDriveUrl: input.data.photosDriveUrl || null, videosDriveUrl: input.data.videosDriveUrl || null }).where(eq(developments.id, input.id));
      await db.update(properties).set({ developmentName: input.data.name, developmentInfo: input.data.description, developmentPhotos: JSON.stringify(input.data.photos), details: JSON.stringify(input.data.details), mapUrl: input.data.mapUrl || null, mapDriveUrl: input.data.mapDriveUrl || null, photosDriveUrl: input.data.photosDriveUrl || null, videosDriveUrl: input.data.videosDriveUrl || null }).where(and(eq(properties.organizationId, scope.organizationId), eq(properties.developmentId, input.id)));
      return { success: true as const };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await ensureDevelopmentsTable(); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" }); const scope = await requireCompanyAdmin(ctx);
      const [existing] = await db.select({ id: developments.id }).from(developments).where(and(eq(developments.id, input.id), eq(developments.organizationId, scope.organizationId))).limit(1); if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Empreendimento não encontrado." });
      await db.update(properties).set({ developmentId: null }).where(and(eq(properties.organizationId, scope.organizationId), eq(properties.developmentId, input.id))); await db.delete(developments).where(eq(developments.id, input.id)); return { success: true as const };
    }),
  }),

  organizations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await ensureOrganizationColumns();
      await ensureOrganizationPropertiesTable();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const rows = ctx.user.role === "admin"
        ? await db.select().from(organizations).orderBy(organizations.name)
        : await db.select().from(organizationMembers).innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id)).where(eq(organizationMembers.userId, ctx.user.id)).then(items => items.map(row => row.organizations));
      return Promise.all(rows.map(async organization => {
        const availableProperties = (await getPropertiesForOrganization(db, organization.id)).filter(property => property.status === "available" && property.publicEnabled === 1).sort((a, b) => a.title.localeCompare(b.title));
        return { ...organization, availablePropertyCount: availableProperties.length, availableProperties: availableProperties.map(property => parseProperty(property)) };
      }));
    }),

    create: protectedProcedure.input(z.object({ entityType: z.enum(["construtora", "imobiliaria", "corretor", "investidor"]).default("construtora"), name: z.string().trim().min(2).max(180), publicName: z.string().trim().max(180).optional().default(""), catalogPeriod: z.string().trim().max(80).optional().default("Setembro de 2026"), logoUrl: z.string().trim().url().or(z.string().trim().startsWith("/media/")).or(z.literal("")), coverPhotoUrl: z.string().trim().url().or(z.string().trim().startsWith("/media/")).or(z.literal("")).optional().default(""), contactName: z.string().trim().max(180).optional().default(""), contactPhone: z.string().trim().max(32).optional().default(""), secondaryContactName: z.string().trim().max(180).optional().default(""), secondaryContactPhone: z.string().trim().max(32).optional().default(""), contactEmail: z.string().trim().email().or(z.literal("")), contactAddress: z.string().trim().max(500).optional().default(""), websiteUrl: z.string().trim().url().or(z.literal("")), tableType: z.enum(["third_party", "own_development"]), developmentName: z.string().trim().max(180).optional().default(""), developmentDescription: z.string().optional().default("") })).mutation(async ({ ctx, input }) => {
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
      await db.insert(organizations).values({ slug, entityType: input.entityType, name: input.name, publicName: input.publicName || input.name, catalogPeriod: input.catalogPeriod || "Setembro de 2026", logoUrl: input.logoUrl || null, coverPhotoUrl: input.coverPhotoUrl || null, contactName: input.contactName || null, contactPhone: input.contactPhone || null, secondaryContactName: input.secondaryContactName || null, secondaryContactPhone: input.secondaryContactPhone || null, contactEmail: input.contactEmail || null, contactAddress: input.contactAddress || null, websiteUrl: input.websiteUrl || null, tableType: input.tableType, developmentName: input.developmentName || null, developmentDescription: input.developmentDescription || null });
      const [createdOrganization] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
      if (!createdOrganization) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar a construtora." });
      const organizationId = createdOrganization.id;
      await db.insert(organizationMembers).values({ organizationId, userId: ctx.user.id, role: "company_admin" });
      await ensureResponsibleProfilesTable();
      const initialProfiles = [{ name: input.contactName, phone: input.contactPhone }, { name: input.secondaryContactName, phone: input.secondaryContactPhone }].filter(profile => profile.name.trim().length >= 2).map(profile => ({ organizationId, name: profile.name.trim(), phone: profile.phone?.trim() || null, email: null, creci: null, photoUrl: null, bio: null, createdAt: new Date(), updatedAt: new Date() }));
      if (initialProfiles.length) await db.insert(responsibleProfiles).values(initialProfiles);
      await db.update(users).set({ activeOrganizationId: organizationId }).where(eq(users.id, ctx.user.id));
      await recordAudit(ctx, organizationId, "organization.created", "organization", organizationId, { name: input.name });
      return { id: organizationId, name: input.name, publicName: input.publicName || input.name };
    }),

    update: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), entityType: z.enum(["construtora", "imobiliaria", "corretor", "investidor"]).default("construtora"), name: z.string().trim().min(2).max(180), publicName: z.string().trim().max(180), catalogPeriod: z.string().trim().max(80), logoUrl: z.string().trim().url().or(z.string().trim().startsWith("/media/")).or(z.literal("")), coverPhotoUrl: z.string().trim().url().or(z.string().trim().startsWith("/media/")).or(z.literal("")), contactName: z.string().trim().max(180), contactPhone: z.string().trim().max(32), secondaryContactName: z.string().trim().max(180), secondaryContactPhone: z.string().trim().max(32), contactEmail: z.string().trim().email().or(z.literal("")), contactAddress: z.string().trim().max(500), websiteUrl: z.string().trim().url().or(z.literal("")), tableType: z.enum(["third_party", "own_development"]), developmentName: z.string().trim().max(180), developmentDescription: z.string() })).mutation(async ({ ctx, input }) => { await ensureOrganizationColumns(); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" }); if (ctx.user.role !== "admin") await requireCompanyAdmin(ctx); await db.update(organizations).set({ entityType: input.entityType, name: input.name, publicName: input.publicName || input.name, catalogPeriod: input.catalogPeriod || "Setembro de 2026", logoUrl: input.logoUrl || null, coverPhotoUrl: input.coverPhotoUrl || null, contactName: input.contactName || null, contactPhone: input.contactPhone || null, secondaryContactName: input.secondaryContactName || null, secondaryContactPhone: input.secondaryContactPhone || null, contactEmail: input.contactEmail || null, contactAddress: input.contactAddress || null, websiteUrl: input.websiteUrl || null, tableType: input.tableType, developmentName: input.developmentName || null, developmentDescription: input.developmentDescription || null }).where(eq(organizations.id, input.organizationId)); return { success: true as const }; }),

    delete: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Somente o administrador pode excluir uma tabela." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const [organization] = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
      if (!organization) throw new TRPCError({ code: "NOT_FOUND", message: "Tabela não encontrada." });
      await ensureOrganizationPropertiesTable();
      await db.delete(shareLinks).where(eq(shareLinks.organizationId, input.organizationId));
      await db.delete(organizationProperties).where(eq(organizationProperties.organizationId, input.organizationId));
      await db.delete(properties).where(eq(properties.organizationId, input.organizationId));
      await ensureResponsibleProfilesTable();
      await db.delete(responsibleProfiles).where(eq(responsibleProfiles.organizationId, input.organizationId));
      await db.delete(organizationInvites).where(eq(organizationInvites.organizationId, input.organizationId));
      await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, input.organizationId));
      await db.delete(auditLogs).where(eq(auditLogs.organizationId, input.organizationId));
      await db.delete(organizations).where(eq(organizations.id, input.organizationId));
      await db.update(users).set({ activeOrganizationId: null }).where(eq(users.activeOrganizationId, input.organizationId));
      return { success: true as const, name: organization.name };
    }),

    availableProperties: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), search: z.string().trim().optional() })).query(async ({ ctx, input }) => {
      await ensureOrganizationPropertiesTable();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      if (ctx.user.role !== "admin") {
        const scope = await getOrganizationForUser(ctx.user.id, ctx.user.openId, ctx.user.role, input.organizationId);
        if (!scope || scope.memberRole !== "company_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem adicionar imóveis à tabela." });
      }
      const current = await getPropertiesForOrganization(db, input.organizationId);
      const currentIds = new Set(current.map(property => property.id));
      const search = input.search?.toLowerCase();
      const rows = await db.select().from(properties).orderBy(properties.title);
      return rows.filter(property => !search || [property.title, property.address, property.developmentName, property.price].some(value => value?.toLowerCase().includes(search))).map(property => ({ ...parseProperty(property), alreadyLinked: currentIds.has(property.id) }));
    }),

    linkProperties: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), propertyIds: z.array(z.number().int().positive()).min(1).max(200), responsibleName: z.string().trim().max(180).optional(), responsiblePhone: z.string().trim().max(32).optional() })).mutation(async ({ ctx, input }) => {
      await ensureOrganizationPropertiesTable();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      if (ctx.user.role !== "admin") {
        const scope = await getOrganizationForUser(ctx.user.id, ctx.user.openId, ctx.user.role, input.organizationId);
        if (!scope || scope.memberRole !== "company_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem adicionar imóveis à tabela." });
      }
      const rows = await db.select({ id: properties.id }).from(properties).where(inArray(properties.id, input.propertyIds));
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum imóvel válido foi selecionado." });
      await db.insert(organizationProperties).values(rows.map(row => ({ organizationId: input.organizationId, propertyId: row.id, responsibleName: input.responsibleName || null, responsiblePhone: input.responsiblePhone || null }))).onConflictDoUpdate({ target: [organizationProperties.organizationId, organizationProperties.propertyId], set: { responsibleName: input.responsibleName || null, responsiblePhone: input.responsiblePhone || null } });
      await recordAudit(ctx, input.organizationId, "organization.properties_linked", "organization_properties", input.organizationId, { count: rows.length });
      return { count: rows.length };
    }),

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

  responsibleProfiles: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await ensureResponsibleProfilesTable();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const saved = await db.select().from(responsibleProfiles).where(eq(responsibleProfiles.organizationId, scope.organizationId)).orderBy(responsibleProfiles.name);
      const propertyRows = await db.select({ name: properties.responsibleName, phone: properties.responsiblePhone }).from(properties).where(and(eq(properties.organizationId, scope.organizationId), eq(properties.status, "available")));
      const savedNames = new Set(saved.map(profile => profile.name.trim().toLowerCase()));
      const discovered = propertyRows.filter(row => row.name?.trim() && !savedNames.has(row.name.trim().toLowerCase())).reduce((rows, row) => { const name = row.name!.trim(); if (!rows.some(item => item.name.toLowerCase() === name.toLowerCase())) rows.push({ id: -rows.length - 1, organizationId: scope.organizationId, name, phone: row.phone || null, email: null, creci: null, photoUrl: null, bio: null, createdAt: null, updatedAt: null, persisted: false }); return rows; }, [] as Array<{ id: number; organizationId: number; name: string; phone: string | null; email: null; creci: null; photoUrl: null; bio: null; createdAt: null; updatedAt: null; persisted: boolean }>);
      return [...saved.map(profile => ({ ...profile, persisted: true })), ...discovered];
    }),
    upsert: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), name: z.string().trim().min(2).max(180), phone: z.string().trim().max(32).optional().default(""), email: z.string().trim().email().or(z.literal("")).optional().default(""), creci: z.string().trim().max(60).optional().default(""), photoUrl: z.string().trim().startsWith("/media/").or(z.literal("")).optional().default(""), bio: z.string().trim().max(1000).optional().default("") })).mutation(async ({ ctx, input }) => {
      await ensureResponsibleProfilesTable();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const values = { organizationId: scope.organizationId, name: input.name, phone: input.phone || null, email: input.email || null, creci: input.creci || null, photoUrl: input.photoUrl || null, bio: input.bio || null, updatedAt: new Date() };
      if (input.id) await db.update(responsibleProfiles).set(values).where(and(eq(responsibleProfiles.id, input.id), eq(responsibleProfiles.organizationId, scope.organizationId)));
      else await db.insert(responsibleProfiles).values({ ...values, createdAt: new Date() });
      return { success: true as const };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await ensureResponsibleProfilesTable();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      await db.delete(responsibleProfiles).where(and(eq(responsibleProfiles.id, input.id), eq(responsibleProfiles.organizationId, scope.organizationId)));
      return { success: true as const };
    }),
  }),

  catalog: router({
    list: protectedProcedure.input(propertyInput.optional()).query(async ({ ctx, input }) => {
      await ensurePropertyPrivateColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const search = input?.search?.trim().toLowerCase();
      const rows = await getPropertiesForOrganization(db, scope.organizationId);
      return rows.filter(row => !search || [row.title, row.address, row.price, row.developmentName].some(value => value?.toLowerCase().includes(search))).sort((a, b) => a.title.localeCompare(b.title)).map(row => parseProperty(row));
    }),

    createLink: protectedProcedure.input(z.object({ propertyId: z.number(), organizationId: z.number().int().positive().optional(), brokerName: z.string().trim().min(3).max(180), brokerPhone: z.string().regex(/^\d{12,15}$/), brokerPhotoUrl: z.string().trim().startsWith("/media/").or(z.literal("")).optional().default("") })).mutation(async ({ ctx, input }) => {
      await ensureShareLinkColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await getOrganizationForUser(ctx.user.id, ctx.user.openId, ctx.user.role, input.organizationId ?? ctx.user.activeOrganizationId ?? undefined);
      if (!scope) throw new TRPCError({ code: "FORBIDDEN", message: "Sua conta ainda não está vinculada a uma empresa." });
      const [property] = await db.select().from(properties).where(eq(properties.id, input.propertyId)).limit(1);
      if (property && !(await propertyBelongsToOrganization(db, scope.organizationId, property.id))) throw new TRPCError({ code: "NOT_FOUND", message: "Imóvel não pertence a esta tabela." });
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Imóvel não encontrado" });
      if (property.status !== "available" || !property.publicEnabled) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Este imóvel não está disponível para divulgação." });
      const token = nanoid(24);
      await db.insert(shareLinks).values({ organizationId: scope.organizationId, propertyId: property.id, token, brokerName: input.brokerName, brokerPhone: input.brokerPhone, brokerPhotoUrl: input.brokerPhotoUrl || null, createdBy: ctx.user.id });
      await recordAudit(ctx, scope.organizationId, "share_link.created", "share_link", undefined, { propertyId: property.id, brokerName: input.brokerName });
      return { token, property: parseProperty(property), profileType: ctx.user.profileType === "corretora" ? "corretora" : "corretor", brokerSlug: input.brokerName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) };
    }),

    publicByCode: publicProcedure.input(z.object({ code: z.string().regex(/^ML-\d+$/i) })).query(async ({ input }) => {
      await ensurePropertyPrivateColumns(); await ensureOrganizationColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const propertyId = Number(input.code.replace(/\D/g, ""));
      const [row] = await db.select({ property: properties, organization: organizations }).from(properties).innerJoin(organizations, eq(properties.organizationId, organizations.id)).where(and(eq(properties.id, propertyId), eq(properties.publicEnabled, 1), eq(properties.status, "available"))).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Imóvel não encontrado ou indisponível." });
      return { property: parseProperty(row.property, false), broker: null, organization: { slug: row.organization.slug, name: row.organization.publicName || row.organization.name, logoUrl: row.organization.logoUrl, coverPhotoUrl: row.organization.coverPhotoUrl, contactName: row.organization.contactName, contactPhone: row.organization.contactPhone, tableType: row.organization.tableType, developmentName: row.organization.developmentName } };
    }),

    publicFriendlyLink: publicProcedure.input(z.object({ code: z.string().regex(/^ML-\d+$/i), brokerSlug: z.string().trim().min(2).max(120) })).query(async ({ input }) => {
      await ensurePropertyPrivateColumns(); await ensureShareLinkColumns(); await ensureOrganizationColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const propertyId = Number(input.code.replace(/\D/g, ""));
      const rows = await db.select({ link: shareLinks, property: properties, organization: organizations }).from(shareLinks).innerJoin(properties, eq(shareLinks.propertyId, properties.id)).innerJoin(organizations, eq(shareLinks.organizationId, organizations.id)).where(and(eq(properties.id, propertyId), eq(shareLinks.enabled, 1), eq(properties.publicEnabled, 1), eq(properties.status, "available"))).orderBy(shareLinks.createdAt);
      const slugify = (name: string) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const row = rows.reverse().find(item => slugify(item.link.brokerName) === input.brokerSlug);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Assinatura do corretor não encontrada ou expirada." });
      return { property: parseProperty(row.property, false), broker: { name: row.link.brokerName, phone: row.link.brokerPhone, photoUrl: row.link.brokerPhotoUrl }, organization: { slug: row.organization.slug, name: row.organization.publicName || row.organization.name, logoUrl: row.organization.logoUrl, coverPhotoUrl: row.organization.coverPhotoUrl, contactName: row.organization.contactName, contactPhone: row.organization.contactPhone, tableType: row.organization.tableType, developmentName: row.organization.developmentName } };
    }),

    publicLink: publicProcedure.input(z.object({ token: z.string().trim().min(8).max(80) })).query(async ({ input }) => {
      await ensurePropertyPrivateColumns(); await ensureShareLinkColumns();
      await ensureOrganizationColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const [link] = await db.select({ link: shareLinks, property: properties, organization: organizations }).from(shareLinks).innerJoin(properties, eq(shareLinks.propertyId, properties.id)).innerJoin(organizations, eq(shareLinks.organizationId, organizations.id)).where(and(eq(shareLinks.token, input.token), eq(shareLinks.enabled, 1), eq(properties.publicEnabled, 1), eq(properties.status, "available"))).limit(1);
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Link de imóvel inválido ou expirado" });
      return { property: parseProperty(link.property, false), broker: { name: link.link.brokerName, phone: link.link.brokerPhone, photoUrl: link.link.brokerPhotoUrl }, organization: { slug: link.organization.slug, name: link.organization.publicName || link.organization.name, logoUrl: link.organization.logoUrl, contactName: link.organization.contactName, contactPhone: link.organization.contactPhone, tableType: link.organization.tableType, developmentName: link.organization.developmentName } };
    }),
  }),

  portal: router({
    info: publicProcedure.input(z.object({ slug: z.string().trim().min(2).max(120) })).query(async ({ input }) => { await ensureOrganizationColumns(); await ensureResponsibleProfilesTable(); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" }); const lookupSlug = input.slug === "masterplan-business" ? "felipe-demo" : input.slug; const [organization] = await db.select().from(organizations).where(eq(organizations.slug, lookupSlug)).limit(1); if (!organization) throw new TRPCError({ code: "NOT_FOUND", message: "Tabela não encontrada." }); const profiles = await db.select().from(responsibleProfiles).where(eq(responsibleProfiles.organizationId, organization.id)).orderBy(responsibleProfiles.name); return { id: organization.id, slug: input.slug, name: organization.name, publicName: organization.publicName, catalogPeriod: organization.catalogPeriod, logoUrl: organization.logoUrl, coverPhotoUrl: organization.coverPhotoUrl, tableType: organization.tableType, developmentName: organization.developmentName, profiles }; }),
    publicCatalog: publicProcedure.input(z.object({ slug: z.string().trim().min(2).max(120), responsible: z.string().trim().max(180).optional() })).query(async ({ input }) => {
      await ensureOrganizationColumns(); await ensureResponsibleProfilesTable(); await ensurePropertyPrivateColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const lookupSlug = input.slug === "masterplan-business" ? "felipe-demo" : input.slug; const [organization] = await db.select().from(organizations).where(eq(organizations.slug, lookupSlug)).limit(1);
      if (!organization) throw new TRPCError({ code: "NOT_FOUND", message: "Tabela não encontrada." });
      const profileRows = await db.select().from(responsibleProfiles).where(eq(responsibleProfiles.organizationId, organization.id)).orderBy(responsibleProfiles.name);
      const profileSlug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const selectedProfile = input.responsible ? profileRows.find(profile => profile.name === input.responsible || profileSlug(profile.name) === input.responsible) : undefined;
      let rows = (await getPropertiesForOrganization(db, organization.id)).filter(row => row.status === "available" && row.publicEnabled === 1);
      if (selectedProfile) rows = rows.filter(row => row.responsibleName === selectedProfile.name);
      rows.sort((a, b) => a.title.localeCompare(b.title));
      return { organization: { name: organization.name, publicName: organization.publicName, catalogPeriod: organization.catalogPeriod, slug: input.slug, logoUrl: organization.logoUrl, coverPhotoUrl: organization.coverPhotoUrl, contactPhone: organization.contactPhone, tableType: organization.tableType, developmentName: organization.developmentName }, profiles: profileRows, properties: rows.map(row => parseCatalogProperty(row)) };
    }),
    catalog: protectedProcedure.input(z.object({ slug: z.string().trim().min(2).max(120), responsible: z.string().trim().max(180).optional() })).query(async ({ ctx, input }) => {
      await ensureOrganizationColumns(); await ensureResponsibleProfilesTable(); await ensurePropertyPrivateColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const lookupSlug = input.slug === "masterplan-business" ? "felipe-demo" : input.slug;
      const [organization] = await db.select().from(organizations).where(eq(organizations.slug, lookupSlug)).limit(1);
      if (!organization) throw new TRPCError({ code: "NOT_FOUND", message: "Tabela não encontrada." });
      const [membership] = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.userId, ctx.user.id))).limit(1);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Sua conta não tem acesso a esta tabela." });
      const profiles = await db.select().from(responsibleProfiles).where(eq(responsibleProfiles.organizationId, organization.id)).orderBy(responsibleProfiles.name);
      const profileSlug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const selectedProfile = input.responsible ? profiles.find(profile => profile.name === input.responsible || profileSlug(profile.name) === input.responsible) : undefined;
      let rows = (await getPropertiesForOrganization(db, organization.id)).filter(row => row.status === "available" && row.publicEnabled === 1);
      if (input.responsible) rows = selectedProfile ? rows.filter(row => row.responsibleName?.trim().toLowerCase() === selectedProfile.name.trim().toLowerCase()) : [];
      rows.sort((a, b) => a.title.localeCompare(b.title));
      return { organization: { id: organization.id, slug: input.slug, name: organization.name, publicName: organization.publicName, logoUrl: organization.logoUrl, contactName: organization.contactName, contactPhone: organization.contactPhone, tableType: organization.tableType, developmentName: organization.developmentName, developmentDescription: organization.developmentDescription }, memberRole: membership.role, profiles, properties: rows.map(row => parseCatalogProperty(row)) };
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
    deletePhoto: protectedProcedure.input(z.object({ url: z.string().trim().min(1).max(500) })).mutation(async ({ ctx, input }) => {
      const scope = await requireCompanyAdmin(ctx);
      const prefix = `/media/properties/${scope.organizationId}/`;
      if (!input.url.startsWith(prefix)) throw new TRPCError({ code: "FORBIDDEN", message: "Foto fora da tabela atual." });
      const bucket = getPhotosBucket();
      if (!bucket) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Armazenamento de fotos indisponível." });
      await bucket.delete(input.url.slice("/media/".length));
      return { success: true as const };
    }),
    create: protectedProcedure.input(propertyPayload).mutation(async ({ ctx, input }) => {
      await ensurePropertyPrivateColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const baseSlug = input.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 150) || `imovel-${nanoid(8)}`;
      const slug = `${baseSlug}-${nanoid(5).toLowerCase()}`;
      await db.insert(properties).values({ organizationId: scope.organizationId, developmentId: input.developmentId ?? null, slug, title: input.title, address: input.address, developmentName: input.developmentName, propertyType: input.propertyType, garageSpaces: input.garageSpaces ?? null, unitNumber: input.unitNumber || null, bedrooms: input.bedrooms ?? null, suites: input.suites ?? null, bathrooms: input.bathrooms ?? null, privateArea: input.privateArea || null, keys: input.keys || null, developmentInfo: input.developmentInfo || null, mapUrl: input.mapUrl || null, responsibleName: input.responsibleName, responsiblePhone: input.responsiblePhone, details: JSON.stringify(input.details), price: input.price, commission: input.commission, paymentConditions: input.paymentConditions, notes: input.notes, photos: JSON.stringify([input.coverPhoto || input.photos[0] || "", ...(input.propertyPhotos?.length ? input.propertyPhotos : input.photos.slice(1))].filter(Boolean)), coverPhoto: input.coverPhoto || input.photos[0] || null, propertyPhotos: JSON.stringify(input.propertyPhotos?.length ? input.propertyPhotos : input.photos.slice(1)), developmentPhotos: JSON.stringify(input.developmentPhotos || []), mapDriveUrl: input.mapDriveUrl || null, photosDriveUrl: input.photosDriveUrl || null, videosDriveUrl: input.videosDriveUrl || null, status: input.status, publicEnabled: input.publicEnabled ? 1 : 0 });
      const [created] = await db.select().from(properties).where(and(eq(properties.organizationId, scope.organizationId), eq(properties.slug, slug))).limit(1);
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível carregar o imóvel criado." });
      await recordAudit(ctx, scope.organizationId, "property.created", "property", created.id, { title: created.title });
      return parseProperty(created);
    }),

    bulkCreate: protectedProcedure.input(bulkPropertyInput).mutation(async ({ ctx, input }) => {
      await ensurePropertyPrivateColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const values = input.rows.map(row => {
        const baseSlug = row.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 150) || `imovel-${nanoid(8)}`;
        return { organizationId: scope.organizationId, slug: `${baseSlug}-${nanoid(5).toLowerCase()}`, title: row.title, address: row.address, developmentName: row.developmentName, propertyType: row.propertyType, garageSpaces: row.garageSpaces ?? null, unitNumber: row.unitNumber || null, bedrooms: row.bedrooms ?? null, suites: row.suites ?? null, bathrooms: row.bathrooms ?? null, privateArea: row.privateArea || null, keys: row.keys || null, developmentInfo: row.developmentInfo || null, mapUrl: row.mapUrl || null, responsibleName: row.responsibleName, responsiblePhone: row.responsiblePhone, details: JSON.stringify(row.details), price: row.price, commission: row.commission, paymentConditions: row.paymentConditions, notes: row.notes, photos: JSON.stringify([row.coverPhoto || row.photos[0] || "", ...(row.propertyPhotos?.length ? row.propertyPhotos : row.photos.slice(1))].filter(Boolean)), coverPhoto: row.coverPhoto || row.photos[0] || null, propertyPhotos: JSON.stringify(row.propertyPhotos?.length ? row.propertyPhotos : row.photos.slice(1)), developmentPhotos: JSON.stringify(row.developmentPhotos || []), mapDriveUrl: row.mapDriveUrl || null, photosDriveUrl: row.photosDriveUrl || null, videosDriveUrl: row.videosDriveUrl || null, status: row.status, publicEnabled: row.publicEnabled ? 1 : 0 };
      });
      await db.insert(properties).values(values);
      await recordAudit(ctx, scope.organizationId, "property.bulk_created", "property", undefined, { count: values.length });
      return { success: true as const, count: values.length };
    }),

    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), data: propertyPayload })).mutation(async ({ ctx, input }) => {
      await ensurePropertyPrivateColumns();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const [existing] = await db.select().from(properties).where(eq(properties.id, input.id)).limit(1);
      if (!existing || !(await propertyBelongsToOrganization(db, scope.organizationId, input.id))) throw new TRPCError({ code: "NOT_FOUND", message: "Imóvel não encontrado nesta tabela." });
      await db.update(properties).set({ developmentId: input.data.developmentId ?? null, title: input.data.title, address: input.data.address, developmentName: input.data.developmentName, propertyType: input.data.propertyType, garageSpaces: input.data.garageSpaces ?? null, unitNumber: input.data.unitNumber || null, bedrooms: input.data.bedrooms ?? null, suites: input.data.suites ?? null, bathrooms: input.data.bathrooms ?? null, privateArea: input.data.privateArea || null, keys: input.data.keys || null, developmentInfo: input.data.developmentInfo || null, mapUrl: input.data.mapUrl || null, responsibleName: input.data.responsibleName, responsiblePhone: input.data.responsiblePhone, details: JSON.stringify(input.data.details), price: input.data.price, commission: input.data.commission, paymentConditions: input.data.paymentConditions, notes: input.data.notes, photos: JSON.stringify([input.data.coverPhoto || input.data.photos[0] || "", ...(input.data.propertyPhotos?.length ? input.data.propertyPhotos : input.data.photos.slice(1))].filter(Boolean)), coverPhoto: input.data.coverPhoto || input.data.photos[0] || null, propertyPhotos: JSON.stringify(input.data.propertyPhotos?.length ? input.data.propertyPhotos : input.data.photos.slice(1)), developmentPhotos: JSON.stringify(input.data.developmentPhotos || []), mapDriveUrl: input.data.mapDriveUrl || null, photosDriveUrl: input.data.photosDriveUrl || null, videosDriveUrl: input.data.videosDriveUrl || null, status: input.data.status, publicEnabled: input.data.publicEnabled ? 1 : 0 }).where(eq(properties.id, input.id));
      const [updated] = await db.select().from(properties).where(eq(properties.id, input.id)).limit(1);
      await recordAudit(ctx, scope.organizationId, "property.updated", "property", input.id, { title: input.data.title, status: input.data.status });
      return parseProperty(updated!);
    }),

    archive: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const [existing] = await db.select().from(properties).where(eq(properties.id, input.id)).limit(1);
      if (!existing || !(await propertyBelongsToOrganization(db, scope.organizationId, input.id))) throw new TRPCError({ code: "NOT_FOUND", message: "Imóvel não encontrado nesta tabela." });
      await db.update(properties).set({ status: "hidden", publicEnabled: 0 }).where(eq(properties.id, input.id));
      await recordAudit(ctx, scope.organizationId, "property.archived", "property", input.id, { title: existing.title });
      return { success: true as const };
    }),

    deletePermanently: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const [existing] = await db.select().from(properties).where(eq(properties.id, input.id)).limit(1);
      if (!existing || !(await propertyBelongsToOrganization(db, scope.organizationId, input.id))) throw new TRPCError({ code: "NOT_FOUND", message: "Imóvel não encontrado nesta tabela." });
      if (existing.organizationId !== scope.organizationId) {
        await db.delete(organizationProperties).where(and(eq(organizationProperties.organizationId, scope.organizationId), eq(organizationProperties.propertyId, input.id)));
        await recordAudit(ctx, scope.organizationId, "property.deleted_permanently", "organization_property", input.id, { title: existing.title, removedFromTableOnly: true });
        return { success: true as const, removedFromTableOnly: true };
      }

      const photoUrls = new Set<string>();
      for (const value of [existing.photos, existing.coverPhoto, existing.propertyPhotos, existing.developmentPhotos]) {
        if (!value) continue;
        try {
          const parsed = JSON.parse(value) as unknown;
          if (Array.isArray(parsed)) parsed.forEach(item => { if (typeof item === "string") photoUrls.add(item); });
          else if (typeof parsed === "string") photoUrls.add(parsed);
        } catch {
          if (value.startsWith("/media/")) photoUrls.add(value);
        }
      }
      const bucket = getPhotosBucket();
      if (bucket) {
        const allowedPrefix = `/media/properties/${scope.organizationId}/`;
        await Promise.all(Array.from(photoUrls).filter(url => url.startsWith(allowedPrefix)).map(url => bucket.delete(url.slice("/media/".length))));
      }
      await db.delete(shareLinks).where(and(eq(shareLinks.propertyId, input.id), eq(shareLinks.organizationId, scope.organizationId)));
      await db.delete(properties).where(and(eq(properties.id, input.id), eq(properties.organizationId, scope.organizationId)));
      await recordAudit(ctx, scope.organizationId, "property.deleted_permanently", "property", input.id, { title: existing.title });
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
