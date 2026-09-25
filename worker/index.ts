import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import { registerOAuthRoutes } from "../server/_core/oauth";



type PreviewProperty = {
  organizationId?: number;
  organizationName?: string | null;
  organizationPublicName?: string | null;
  title: string;
  address: string | null;
  photos: string;
  coverPhoto?: string | null;
  brokerName?: string | null;
};

type PreviewCatalog = {
  id: number;
  name: string;
  publicName?: string | null;
  catalogPeriod?: string | null;
  logoUrl?: string | null;
};

let previewColumnsReady = false;
async function ensurePreviewColumns(database: D1Database) {
  if (previewColumnsReady) return;
  for (const column of ["coverPhoto", "propertyPhotos", "developmentPhotos"]) {
    try {
      await database.prepare(`ALTER TABLE properties ADD COLUMN ${column} TEXT`).run();
    } catch (error) {
      if (!String(error).toLowerCase().includes("duplicate column")) throw error;
    }
  }
  previewColumnsReady = true;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function profileSlug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function getPropertyPreview(request: Request): Promise<{ title: string; description: string; image?: string } | null> {
  const url = new URL(request.url);
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) return null;
  await ensurePreviewColumns(database);

  const catalogMatch = url.pathname.match(/^\/tabelas?\/([^/]+)(?:\/([^/]+))?\/?$/i);
  if (catalogMatch) {
    const catalogSlug = catalogMatch[1].toLowerCase() === "masterplan-business" ? "felipe-demo" : catalogMatch[1];
    const catalog = await database.prepare("SELECT id, name, publicName, catalogPeriod, logoUrl FROM organizations WHERE slug = ? LIMIT 1").bind(catalogSlug).first<PreviewCatalog>();
    if (catalog) {
      const catalogName = catalog.publicName || catalog.name;
      const previewOrganizationName = catalogSlug.toLowerCase() === "atlantida-negocios-imobiliarios" || catalogName.toLowerCase().includes("atlântida negócios") || catalog.name.toLowerCase().includes("atlântida negócios") ? "Atlântida Negócios Imobiliários" : catalogName;
      const period = catalog.catalogPeriod ? ` — ${catalog.catalogPeriod}` : "";
      const image = catalog.logoUrl ? new URL(catalog.logoUrl, url.origin).toString() : undefined;
      const routeProfile = catalogMatch[2] && !["todos", "compartilhar"].includes(catalogMatch[2].toLowerCase()) ? catalogMatch[2] : "";
      if (routeProfile) {
        const profiles = await database.prepare("SELECT name FROM responsibleProfiles WHERE organizationId = ? ORDER BY name").bind(catalog.id).all<{ name: string }>();
        const profile = (profiles.results || []).find(item => profileSlug(item.name) === routeProfile.toLowerCase());
        const profileName = profile?.name || routeProfile.replace(/-/g, " ").replace(/\b\w/g, character => character.toUpperCase());
        const title = `Tabela de imóveis - ${profileName} | ${previewOrganizationName}`;
        return {
          title,
          description: `${title}. Confira os imóveis disponíveis e entre em contato pelo WhatsApp.`,
          image,
        };
      }
      return {
        title: `${catalogName} | Tabela de imóveis`,
        description: `Consulte os imóveis disponíveis da ${catalogName}${period}. Veja fotos, valores e informações para encontrar o imóvel ideal.`,
        image,
      };
    }
  }

  let property: PreviewProperty | null = null;
  let sharedBrokerName = "";
  const codeMatch = url.pathname.match(/^\/(?:imovel|((?:corretor|corretora)\/([^/]+))\/imovel)\/(ML-\d+)$/i);
  const token = url.searchParams.get("link");
  if (token) {
    const result = await database.prepare("SELECT s.brokerName, p.organizationId, o.name AS organizationName, o.publicName AS organizationPublicName, p.title, p.address, p.photos, p.coverPhoto FROM shareLinks s INNER JOIN properties p ON p.id = s.propertyId INNER JOIN organizations o ON o.id = p.organizationId WHERE s.token = ? AND s.enabled = 1 AND p.publicEnabled = 1 AND p.status = 'available' LIMIT 1").bind(token).first<PreviewProperty>();
    property = result || null;
    sharedBrokerName = result?.brokerName || "";
  }
  if (!property && codeMatch) {
    const id = Number(codeMatch[3].slice(3));
    if (Number.isInteger(id) && id > 0) {
      const result = await database.prepare("SELECT p.organizationId, o.name AS organizationName, o.publicName AS organizationPublicName, p.title, p.address, p.photos, p.coverPhoto FROM properties p INNER JOIN organizations o ON o.id = p.organizationId WHERE p.id = ? AND p.publicEnabled = 1 AND p.status = 'available' LIMIT 1").bind(id).first<PreviewProperty>();
      property = result || null;
      sharedBrokerName = codeMatch[2] ? codeMatch[2].replace(/-/g, " ").replace(/\b\w/g, character => character.toUpperCase()) : "";
    }
  }
  if (!property) return null;

  let image: string | undefined;
  try {
    const photos = JSON.parse(property.photos || "[]") as unknown;
    const cover = property.coverPhoto || (Array.isArray(photos) && typeof photos[0] === "string" ? photos[0] : "");
    if (cover) image = new URL(cover, url.origin).toString();
  } catch {
    image = undefined;
  }

  const organizationName = property.organizationPublicName || property.organizationName || "";
  const title = sharedBrokerName && organizationName ? `Tabela de imóveis - ${sharedBrokerName} | ${organizationName}` : `MeuLink Imóveis | ${property.title}`;
  const description = sharedBrokerName && organizationName ? `${title}. Confira ${property.title}${property.address ? ` em ${property.address}` : ""} e entre em contato pelo WhatsApp.` : `Veja fotos, características e localização de ${property.title}${property.address ? ` em ${property.address}` : ""}. Fale com o corretor e agende uma visita.`;
  return { title, description, image };
}

async function serveAppWithPreview(request: Request, assets: Fetcher) {
  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const response = await assets.fetch(new Request(new URL("/", request.url), request));
  const preview = await getPropertyPreview(request);
  if (!preview || !response.ok) return response;
  const html = await response.text();
  const tags = [
    `<meta name="description" content="${escapeHtml(preview.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(preview.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(preview.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(request.url)}" />`,
    preview.image ? `<meta property="og:image" content="${escapeHtml(preview.image)}" />` : "",
    preview.image ? `<meta property="og:image:alt" content="Capa de ${escapeHtml(preview.title)}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(preview.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(preview.description)}" />`,
    preview.image ? `<meta name="twitter:image" content="${escapeHtml(preview.image)}" />` : "",
  ].filter(Boolean).join("\n    ");
  const withTitle = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(preview.title)}</title>`);
  const updated = withTitle.replace("</head>", `    ${tags}\n  </head>`);
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=UTF-8");
  headers.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  const result = new Response(updated, { status: response.status, headers });
  await cache.put(cacheKey, result.clone());
  return result;
}

const app = express();
app.use((req, _res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || !req.headers["content-type"]?.includes("application/json")) {
    next();
    return;
  }
  const chunks: Buffer[] = [];
  req.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  req.on("end", () => {
    try {
      req.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      next();
    } catch {
      _res.status(400).json({ error: "JSON inválido" });
    }
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "meulink-api", runtime: "cloudflare-workers" });
});

const photos = (env as unknown as { PHOTOS: R2Bucket }).PHOTOS;
(globalThis as typeof globalThis & { __MEULINK_PHOTOS?: R2Bucket }).__MEULINK_PHOTOS = photos;
app.get("/media/*", async (req, res) => {
  const key = req.path.slice("/media/".length);
  if (!key || key.includes("..")) {
    res.status(400).json({ error: "Invalid media key" });
    return;
  }
  const object = await photos.get(key);
  if (!object) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", object.httpMetadata?.contentType ?? "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(Buffer.from(await object.arrayBuffer()));
});

registerOAuthRoutes(app);
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

// The binding is request-scoped in Workers. The database helper reads this
// value when a tRPC procedure asks for the current Drizzle instance.
const runtimeEnv = env as unknown as { DB: D1Database };
(globalThis as typeof globalThis & { __MEULINK_D1?: D1Database }).__MEULINK_D1 = runtimeEnv.DB;

app.listen(3000);
const nodeHandler = httpServerHandler({ port: 3000 });

export default {
  async fetch(request: Request, workerEnv: { ASSETS: Fetcher }, ctx: ExecutionContext) {
    const pathname = new URL(request.url).pathname;
    const isBackendRoute = pathname === "/health" || pathname.startsWith("/api/") || pathname.startsWith("/media/");
    if (isBackendRoute) {
      return nodeHandler.fetch(request, workerEnv, ctx);
    }

    const isStaticAsset = pathname === "/" || pathname === "/index.html" || pathname.startsWith("/assets/") || pathname === "/favicon.ico" || pathname === "/robots.txt";
    if (isStaticAsset) {
      const assetResponse = await workerEnv.ASSETS.fetch(request);
      if (pathname.startsWith("/assets/")) {
        const headers = new Headers(assetResponse.headers);
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        return new Response(assetResponse.body, { status: assetResponse.status, headers });
      }
      return assetResponse;
    }

    return serveAppWithPreview(request, workerEnv.ASSETS);
  },
};
