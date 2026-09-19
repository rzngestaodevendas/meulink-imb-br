import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import { registerOAuthRoutes } from "../server/_core/oauth";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "meulink-api", runtime: "cloudflare-workers" });
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
export default httpServerHandler({ port: 3000 });
