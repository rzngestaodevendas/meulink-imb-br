import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organizationInvites, organizationMembers, organizations, properties, shareLinks, users } from "../drizzle/schema";
import { getAuditLogs, getDb, getOrganizationForUser, writeAuditLog } from "./db";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { storagePut } from "./storage";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { and, eq, isNull, like, or } from "drizzle-orm";

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
  photos: z.array(z.string().trim().url().or(z.string().trim().startsWith("/manus-storage/"))).max(30),
  crmData: z.record(z.string(), z.unknown()).optional().default({}),
  status: statusSchema,
  publicEnabled: z.boolean(),
});
export const bulkPropertyInput = z.object({ rows: propertyPayload.array().min(1).max(200) });
const imageUploadInput = z.object({
  fileName: z.string().trim().min(1).max(180),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]),
  base64: z.string().min(1).max(12_000_000),
});
export const teamRoleSchema = z.enum(["company_admin", "broker"]);
export const inviteInput = z.object({ email: z.string().trim().email().max(320), role: teamRoleSchema });
export const auditActionSchema = z.enum(["organization.created", "organization.selected", "property.created", "property.bulk_created", "property.updated", "property.archived", "share_link.created", "team.invite_created", "team.invite_revoked", "team.invite_accepted", "team.role_updated", "team.member_removed"]);

function parseProperty(row: typeof properties.$inferSelect, includeInternal = true) {
  const crm = (() => { try { return JSON.parse(row.crmData || "{}"); } catch { return {}; } })() as Record<string, any>;
  const visibility = crm.visibility || {};
  const fullAddress = [crm.street, crm.number, crm.complement, crm.neighborhood, crm.city, crm.state].filter(Boolean).join(", ") || row.address;
  const publicCrm = {
    ...crm,
    condoFee: visibility.condoFee ? crm.condoFee : "",
    propertyTax: visibility.propertyTax ? crm.propertyTax : "",
    quadraLote: visibility.quadraLote ? crm.quadraLote : "",
    developmentName: visibility.development ? crm.developmentName : "",
    developmentType: visibility.development ? crm.developmentType : "",
    developmentDescription: visibility.development ? crm.developmentDescription : "",
    developmentPhotos: visibility.development ? (crm.developmentPhotos || []) : [],
    mapUrl: visibility.map ? crm.mapUrl : "",
    latitude: visibility.map ? crm.latitude : "",
    longitude: visibility.map ? crm.longitude : "",
  };
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    address: includeInternal ? row.address : (visibility.address ? fullAddress : [crm.neighborhood, crm.city, crm.state].filter(Boolean).join(", ") || "Endereço sob consulta"),
    ...(includeInternal ? { responsibleName: row.responsibleName, responsiblePhone: row.responsiblePhone } : {}),
    details: JSON.parse(row.details || "[]") as string[],
    price: row.price,
    notes: row.notes,
    photos: JSON.parse(row.photos || "[]") as string[],
    crm: includeInternal ? crm : publicCrm,
    ...(includeInternal ? { sourceDriveUrl: row.sourceDriveUrl } : {}),
    status: row.status,
    publicEnabled: Boolean(row.publicEnabled),
  };
}

async function requireCompanyAdmin(ctx: { user: { id: number; openId: string; role: string; activeOrganizationId?: number | null } }) {
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
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  organizations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      return db.select({ id: organizations.id, slug: organizations.slug, name: organizations.name, publicName: organizations.publicName, createdAt: organizations.createdAt })
        .from(organizationMembers)
        .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
        .where(eq(organizationMembers.userId, ctx.user.id));
    }),

    create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(180), publicName: z.string().trim().max(180).optional().default("") })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      if (ctx.user.role !== "admin") {
        const current = await getOrganizationForUser(ctx.user.id, ctx.user.openId, ctx.user.role, ctx.user.activeOrganizationId ?? undefined);
        if (!current || current.memberRole !== "company_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem cadastrar uma construtora." });
      }
      const slugBase = input.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "construtora";
      const slug = `${slugBase}-${nanoid(6).toLowerCase()}`;
      const [result] = await db.insert(organizations).values({ slug, name: input.name, publicName: input.publicName || input.name });
      const organizationId = Number(result.insertId);
      await db.insert(organizationMembers).values({ organizationId, userId: ctx.user.id, role: "company_admin" });
      await db.update(users).set({ activeOrganizationId: organizationId }).where(eq(users.id, ctx.user.id));
      await recordAudit(ctx, organizationId, "organization.created", "organization", organizationId, { name: input.name });
      return { id: organizationId, name: input.name, publicName: input.publicName || input.name };
    }),

    select: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const [membership] = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user.id))).limit(1);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Você não pertence a esta construtora." });
      await db.update(users).set({ activeOrganizationId: input.organizationId }).where(eq(users.id, ctx.user.id));
      await recordAudit(ctx, input.organizationId, "organization.selected", "organization", input.organizationId);
      return { success: true as const };
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

    createLink: protectedProcedure.input(z.object({ propertyId: z.number(), organizationId: z.number().int().positive().optional(), brokerName: z.string().trim().min(3).max(180), brokerPhone: z.string().regex(/^\d{12,15}$/) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await getOrganizationForUser(ctx.user.id, ctx.user.openId, ctx.user.role, input.organizationId ?? ctx.user.activeOrganizationId ?? undefined);
      if (!scope) throw new TRPCError({ code: "FORBIDDEN", message: "Sua conta ainda não está vinculada a uma empresa." });
      const [property] = await db.select().from(properties).where(and(eq(properties.id, input.propertyId), eq(properties.organizationId, scope.organizationId))).limit(1);
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Imóvel não encontrado" });
      if (property.status !== "available" || !property.publicEnabled) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Este imóvel não está disponível para divulgação." });
      const token = nanoid(24);
      await db.insert(shareLinks).values({ organizationId: scope.organizationId, propertyId: property.id, token, brokerName: input.brokerName, brokerPhone: input.brokerPhone, createdBy: ctx.user.id });
      await recordAudit(ctx, scope.organizationId, "share_link.created", "share_link", undefined, { propertyId: property.id, brokerName: input.brokerName });
      return { token, property: parseProperty(property) };
    }),

    publicLink: publicProcedure.input(z.object({ token: z.string().trim().min(8).max(80) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const [link] = await db.select({ link: shareLinks, property: properties }).from(shareLinks).innerJoin(properties, eq(shareLinks.propertyId, properties.id)).where(and(eq(shareLinks.token, input.token), eq(shareLinks.enabled, 1), eq(properties.publicEnabled, 1), eq(properties.status, "available"))).limit(1);
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Link de imóvel inválido ou expirado" });
      return { property: parseProperty(link.property, false), broker: { name: link.link.brokerName, phone: link.link.brokerPhone } };
    }),
    publicFriendly: publicProcedure.input(z.object({ brokerSlug: z.string().trim().min(2).max(180), code: z.string().trim().min(2).max(180) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const rows = await db.select({ link: shareLinks, property: properties }).from(shareLinks).innerJoin(properties, eq(shareLinks.propertyId, properties.id)).where(and(eq(shareLinks.enabled, 1), eq(properties.publicEnabled, 1), eq(properties.status, "available")));
      const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const match = rows.find(row => {
        let crm: Record<string, any> = {}; try { crm = JSON.parse(row.property.crmData || "{}"); } catch { /* legacy row */ }
        const propertyCode = crm.code || row.property.slug || `ML-${String(row.property.id).padStart(6, "0")}`;
        return normalize(row.link.brokerName) === input.brokerSlug && normalize(String(propertyCode)) === normalize(input.code);
      });
      if (!match) throw new TRPCError({ code: "NOT_FOUND", message: "Landing do imóvel não encontrada ou indisponível." });
      return { property: parseProperty(match.property, false), broker: { name: match.link.brokerName, phone: match.link.brokerPhone } };
    }),
    publicOrganization: publicProcedure.input(z.object({ slug: z.string().trim().min(2).max(120) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const [organization] = await db.select().from(organizations).where(eq(organizations.slug, input.slug)).limit(1);
      if (!organization) throw new TRPCError({ code: "NOT_FOUND", message: "Imobiliária não encontrada." });
      const rows = await db.select().from(properties).where(and(eq(properties.organizationId, organization.id), eq(properties.status, "available"), eq(properties.publicEnabled, 1))).orderBy(properties.title);
      const members = await db.select({ name: users.name, profilePhoto: users.profilePhoto, role: organizationMembers.role }).from(organizationMembers).innerJoin(users, eq(organizationMembers.userId, users.id)).where(eq(organizationMembers.organizationId, organization.id));
      return { organization: { slug: organization.slug, name: organization.name, publicName: organization.publicName }, members, properties: rows.map(row => parseProperty(row, false)) };
    }),
  }),

  portal: router({
    catalog: protectedProcedure.input(z.object({ slug: z.string().trim().min(2).max(120) })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const [organization] = await db.select().from(organizations).where(eq(organizations.slug, input.slug)).limit(1);
      if (!organization) throw new TRPCError({ code: "NOT_FOUND", message: "Tabela não encontrada." });
      const [membership] = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.userId, ctx.user.id))).limit(1);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Sua conta não tem acesso a esta tabela." });
      const rows = await db.select().from(properties).where(and(eq(properties.organizationId, organization.id), eq(properties.status, "available"), eq(properties.publicEnabled, 1))).orderBy(properties.title);
      return { organization: { id: organization.id, slug: organization.slug, name: organization.name, publicName: organization.publicName }, memberRole: membership.role, properties: rows.map(row => parseProperty(row, true)) };
    }),
  }),

  media: router({
    uploadImage: protectedProcedure.input(imageUploadInput).mutation(async ({ ctx, input }) => {
      const scope = await requireCompanyAdmin(ctx);
      const base64 = input.base64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A imagem deve ter entre 1 byte e 8 MB." });
      }
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "imagem";
      const uploaded = await storagePut(`organizations/${scope.organizationId}/properties/${safeName}`, buffer, input.contentType);
      return { url: uploaded.url };
    }),
  }),

  properties: router({
    create: protectedProcedure.input(propertyPayload).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const baseSlug = input.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 150) || `imovel-${nanoid(8)}`;
      const slug = `${baseSlug}-${nanoid(5).toLowerCase()}`;
      const [result] = await db.insert(properties).values({ organizationId: scope.organizationId, slug, title: input.title, address: input.address, responsibleName: input.responsibleName, responsiblePhone: input.responsiblePhone, details: JSON.stringify(input.details), price: input.price, notes: input.notes, photos: JSON.stringify(input.photos), crmData: JSON.stringify(input.crmData), status: input.status, publicEnabled: input.publicEnabled ? 1 : 0 });
      const [created] = await db.select().from(properties).where(eq(properties.id, Number(result.insertId))).limit(1);
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
        return { organizationId: scope.organizationId, slug: `${baseSlug}-${nanoid(5).toLowerCase()}`, title: row.title, address: row.address, responsibleName: row.responsibleName, responsiblePhone: row.responsiblePhone, details: JSON.stringify(row.details), price: row.price, notes: row.notes, photos: JSON.stringify(row.photos), crmData: JSON.stringify(row.crmData), status: row.status, publicEnabled: row.publicEnabled ? 1 : 0 };
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
      await db.update(properties).set({ title: input.data.title, address: input.data.address, responsibleName: input.data.responsibleName, responsiblePhone: input.data.responsiblePhone, details: JSON.stringify(input.data.details), price: input.data.price, notes: input.data.notes, photos: JSON.stringify(input.data.photos), crmData: JSON.stringify(input.data.crmData), status: input.data.status, publicEnabled: input.data.publicEnabled ? 1 : 0 }).where(eq(properties.id, input.id));
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
      const rows = await db.select({ memberId: organizationMembers.id, userId: users.id, name: users.name, email: users.email, profilePhoto: users.profilePhoto, role: organizationMembers.role, createdAt: organizationMembers.createdAt })
        .from(organizationMembers)
        .innerJoin(users, eq(organizationMembers.userId, users.id))
        .where(eq(organizationMembers.organizationId, scope.organizationId));
      return rows;
    }),
    updateProfile: protectedProcedure.input(z.object({ memberId: z.number().int().positive(), name: z.string().trim().min(2).max(180), profilePhoto: z.string().trim().url().or(z.string().startsWith("/manus-storage/")).optional().default("") })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const scope = await requireCompanyAdmin(ctx);
      const [member] = await db.select().from(organizationMembers).where(and(eq(organizationMembers.id, input.memberId), eq(organizationMembers.organizationId, scope.organizationId))).limit(1);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Membro não encontrado." });
      await db.update(users).set({ name: input.name, profilePhoto: input.profilePhoto || null }).where(eq(users.id, member.userId));
      return { success: true as const };
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
