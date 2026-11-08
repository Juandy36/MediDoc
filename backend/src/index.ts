import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

// Todas las rutas viven bajo /api: el frontend las reenvía con un rewrite.
const app = new Hono().basePath("/api");

app.use(secureHeaders());
app.use(async (c, next) => {
  await next();
  // Datos de salud: nada se cachea en navegador ni en CDN.
  c.header("Cache-Control", "private, no-store");
});

app.get("/health", (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error(err); // solo en logs del servidor; el detalle nunca va al cliente
  return c.json({ error: "internal_error" }, 500);
});

export default app;
