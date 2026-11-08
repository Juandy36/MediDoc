import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { type AppEnv, loadSession, requireSameOrigin } from "./middleware";
import { authRoutes } from "./routes/auth";
import { personasRoutes } from "./routes/personas";
import { compartirRoutes } from "./routes/compartir";

// Todas las rutas viven bajo /api: el frontend las reenvía con un rewrite.
const app = new Hono<AppEnv>().basePath("/api");

app.use(secureHeaders());
app.use(async (c, next) => {
  await next();
  // Datos de salud: nada se cachea en navegador ni en CDN.
  c.header("Cache-Control", "private, no-store");
});
app.use(requireSameOrigin);
app.use(loadSession);

app.get("/health", (c) => c.json({ ok: true }));
app.route("/auth", authRoutes);
app.route("/personas", personasRoutes);
app.route("/compartir", compartirRoutes);

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err); // solo en logs del servidor; el detalle nunca va al cliente
  return c.json({ error: "internal_error" }, 500);
});

export default app;
