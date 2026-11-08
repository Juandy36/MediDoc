// Solo para desarrollo local (no se llama server.ts: Vercel podría tomarlo como entrada).
// En Vercel se usa el export default de index.ts.
import { serve } from "@hono/node-server";
import app from "./index";

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port }, () => console.log(`API en http://localhost:${port}/api`));
