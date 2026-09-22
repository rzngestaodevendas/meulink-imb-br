import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import { registerOAuthRoutes } from "../server/_core/oauth";



type PreviewProperty = {
  title: string;
  address: string | null;
  photos: string;
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

async function getPropertyPreview(request: Request): Promise<{ title: string; description: string; image?: string } | null> {
  const url = new URL(request.url);
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) return null;

  let property: PreviewProperty | null = null;
  const codeMatch = url.pathname.match(/^\/(?:imovel|corretor\/[^/]+\/imovel|corretora\/[^/]+\/imovel)\/(ML-\d+)$/i);
  const token = url.searchParams.get("link");
  if (token) {
    const result = await database.prepare("SELECT p.title, p.address, p.photos FROM shareLinks s INNER JOIN properties p ON p.id = s.propertyId WHERE s.token = ? AND s.enabled = 1 AND p.publicEnabled = 1 AND p.status = 'available' LIMIT 1").bind(token).first<PreviewProperty>();
    property = result || null;
  }
  if (!property && codeMatch) {
    const id = Number(codeMatch[1].slice(3));
    if (Number.isInteger(id) && id > 0) {
      const result = await database.prepare("SELECT title, address, photos FROM properties WHERE id = ? AND publicEnabled = 1 AND status = 'available' LIMIT 1").bind(id).first<PreviewProperty>();
      property = result || null;
    }
  }
  if (!property) return null;

  let image: string | undefined;
  try {
    const photos = JSON.parse(property.photos || "[]") as unknown;
    const cover = Array.isArray(photos) && typeof photos[0] === "string" ? photos[0] : "";
    if (cover) image = new URL(cover, url.origin).toString();
  } catch {
    image = undefined;
  }

  const title = `MeuLink Imóveis | ${property.title}`;
  const description = `Veja fotos, características e localização de ${property.title}${property.address ? ` em ${property.address}` : ""}. Fale com o corretor e agende uma visita.`;
  return { title, description, image };
}

async function serveAppWithPreview(request: Request, assets: Fetcher) {
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
  return new Response(updated, { status: response.status, headers });
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
      return workerEnv.ASSETS.fetch(request);
    }

    return serveAppWithPreview(request, workerEnv.ASSETS);
  },
};
