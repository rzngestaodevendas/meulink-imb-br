import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../server/db";
import { auditLogs, organizationMembers, organizations, properties, shareLinks, users } from "../drizzle/schema";

const root = "/home/ubuntu/atlantida-pdf-assets";
const draft = JSON.parse(fs.readFileSync(path.join(root, "catalogo-draft.json"), "utf8")) as Array<any>;
const uploadText = fs.readFileSync(path.join(root, "storage-upload.txt"), "utf8");
const uploaded = new Map<string, string>();
for (const line of uploadText.split(/\r?\n/)) {
  const m = line.match(/(?:SUCCESS|Storage Path:)\s*(?:[^>]*->\s*)?\/manus-storage\/([^\s\r]+)/);
  if (m) {
    const filename = m[1].replace(/_[a-f0-9]{8}(?=\.[^.]+$)/, "");
    uploaded.set(filename, `/manus-storage/${m[1]}`);
  }
}
const pageImages = new Map<number, string[]>();
const imageList = fs.readFileSync(path.join(root, "images-list.txt"), "utf8");
for (const line of imageList.split(/\r?\n/)) {
  const cols = line.trim().split(/\s+/);
  if (cols.length > 10 && cols[2] === "image" && cols[8] === "jpeg") {
    const page = Number(cols[0]);
    const num = Number(cols[1]);
    const local = `img-${String(num).padStart(3, "0")}.jpg`;
    const url = uploaded.get(local);
    if (url) pageImages.set(page, [...(pageImages.get(page) ?? []), url]);
  }
}
const phones: Record<string, string> = {
  "Alisson Portella": "5551992896556",
  "Anderson Portella": "5551995902785",
  "Jeferson Gimenez": "5551981756594",
  "Juliano Machado": "5551982868888",
  "Marcelo Bereta": "5551999287700",
  "Fernando Trevisol": "5555996904344",
  "Felipe Ranzolin": "5551999442252",
};
const appBase = "https://meulinksaas-mgvqmuqg.manus.space";
function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function cityFor(row: any) {
  const text = `${row.title} ${row.description.join(" ")}`.toLowerCase();
  if (text.includes("porto belo")) return "Porto Belo - SC";
  if (text.includes("carlos barbosa")) return "Carlos Barbosa - RS";
  if (text.includes("osório")) return "Osório - RS";
  if (text.includes("capão")) return "Capão da Canoa - RS";
  return "Atlântida / Xangri-Lá - RS";
}
function cleanPhotos(rows: any[]) {
  const byPage = new Map<number, any[]>();
  for (const row of rows) byPage.set(row.page, [...(byPage.get(row.page) ?? []), row]);
  for (const [page, pageRows] of byPage) {
    const images = pageImages.get(page) ?? [];
    let cursor = 0;
    for (const row of pageRows) {
      // Sold cards use a faded map/photo treatment that is not a standalone JPEG.
      if (row.sold) { row.photos = []; continue; }
      if (images[cursor]) row.photos = [images[cursor++]];
      else if (images.length) row.photos = [images[images.length - 1]];
      else row.photos = [];
    }
  }
}
cleanPhotos(draft);

const db = await getDb();
if (!db) throw new Error("DATABASE_URL indisponível");
const owner = (await db.select().from(users).where(eq(users.openId, process.env.OWNER_OPEN_ID ?? "")).limit(1))[0];
if (!owner) throw new Error("Usuário proprietário não encontrado");
let org = (await db.select().from(organizations).where(eq(organizations.slug, "atlantida-negocios-imobiliarios")).limit(1))[0];
if (!org) {
  const inserted = await db.insert(organizations).values({ slug: "atlantida-negocios-imobiliarios", name: "Atlântida Negócios Imobiliários", publicName: "Atlântida Negócios Imobiliários" });
  org = (await db.select().from(organizations).where(eq(organizations.slug, "atlantida-negocios-imobiliarios")).limit(1))[0];
  if (!org) throw new Error(`Falha ao criar organização: ${JSON.stringify(inserted)}`);
}
// The first attempt may have stopped midway; this organization is created by this import flow.
const previousProperties = await db.select().from(properties).where(eq(properties.organizationId, org.id));
if (previousProperties.length > 0) {
  await db.delete(shareLinks).where(eq(shareLinks.organizationId, org.id));
  await db.delete(properties).where(eq(properties.organizationId, org.id));
  await db.delete(auditLogs).where(eq(auditLogs.organizationId, org.id));
}
await db.insert(organizationMembers).values({ organizationId: org.id, userId: owner.id, role: "company_admin" }).onDuplicateKeyUpdate({ set: { role: "company_admin" } });
await db.update(users).set({ activeOrganizationId: org.id }).where(eq(users.id, owner.id));
const existing = await db.select().from(properties).where(eq(properties.organizationId, org.id));
const links: any[] = [];
let created = 0;
for (const row of draft) {
  const slug = slugify(row.title);
  const old = existing.find(item => item.slug === slug);
  let property = old;
  const values = {
    organizationId: org.id,
    slug,
    title: row.title,
    address: cityFor(row),
    details: JSON.stringify(row.description),
    price: row.price || null,
    notes: row.description.join("\n") || null,
    photos: JSON.stringify(row.photos ?? []),
    sourcePage: row.page,
    status: row.sold ? "sold" as const : "available" as const,
    publicEnabled: row.sold ? 0 : 1,
  };
  if (!property) {
    await db.insert(properties).values(values);
    property = (await db.select().from(properties).where(and(eq(properties.organizationId, org.id), eq(properties.slug, slug))).limit(1))[0];
    created++;
  } else {
    await db.update(properties).set(values).where(eq(properties.id, property.id));
  }
  if (!property) throw new Error(`Imóvel não encontrado após gravação: ${row.title}`);
  const brokerPhone = phones[row.broker];
  if (!brokerPhone) throw new Error(`WhatsApp ausente: ${row.broker}`);
  const prior = (await db.select().from(shareLinks).where(and(eq(shareLinks.propertyId, property.id), eq(shareLinks.organizationId, org.id))).limit(1))[0];
  let link = prior;
  if (!link) {
    const token = nanoid(24);
    await db.insert(shareLinks).values({ organizationId: org.id, propertyId: property.id, token, brokerName: row.broker, brokerPhone, enabled: row.sold ? 0 : 1, createdBy: owner.id, disabledAt: row.sold ? new Date() : null });
    link = (await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1))[0];
  } else {
    await db.update(shareLinks).set({ brokerName: row.broker, brokerPhone, enabled: row.sold ? 0 : 1, disabledAt: row.sold ? new Date() : null }).where(eq(shareLinks.id, link.id));
  }
  if (link) links.push({ title: row.title, broker: row.broker, phone: brokerPhone, status: row.sold ? "sold" : "available", page: row.page, photos: (row.photos ?? []).length, url: `${appBase}/?link=${link.token}` });
}
await db.insert(auditLogs).values({ organizationId: org.id, actorUserId: owner.id, action: "organization_catalog_imported", entityType: "organization", entityId: org.id, metadata: JSON.stringify({ source: "atlantidaimobiliaria.pdf", rows: draft.length, created, sold: draft.filter(row => row.sold).length, photosUploaded: uploaded.size }) });
const result = { organization: org.name, organizationId: org.id, rows: draft.length, created, sold: draft.filter(row => row.sold).length, photosUploaded: uploaded.size, links };
fs.writeFileSync("/home/ubuntu/atlantida-import-result.json", JSON.stringify(result, null, 2));
const csvRows = links.map(item => [item.title, item.broker, item.phone, item.status, item.page, item.photos, item.url].map((value: string) => `"${String(value).replaceAll('"', '""')}"`).join(";"));
fs.writeFileSync("/home/ubuntu/atlantida-links.csv", ["titulo;corretor;whatsapp;status;pagina;fotos;link", ...csvRows].join("\n") + "\n");
console.log(JSON.stringify({ ...result, links: links.length }, null, 2));
