import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";

/** Valida el JSON del cuerpo; 400 si no cumple el schema. */
export async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const raw = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "invalid_json" });
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HTTPException(400, { message: "invalid_input" });
  return parsed.data;
}
