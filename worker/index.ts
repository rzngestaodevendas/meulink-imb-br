import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import { registerOAuthRoutes } from "../server/_core/oauth";

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

    return workerEnv.ASSETS.fetch(new Request(new URL("/", request.url), request));
  },
};
