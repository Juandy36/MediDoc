import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  APP_ORIGIN: z.url(),
  ADMIN_EMAILS: z
    .string()
    .min(1)
    .transform((s) => s.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  FIELD_ENCRYPTION_KEY: z
    .string()
    .refine((k) => Buffer.from(k, "base64").length === 32, "Debe ser 32 bytes en base64"),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Valida las variables de entorno la primera vez que se usan. Nunca imprime sus valores. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const invalid = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Variables de entorno inválidas o ausentes: ${invalid}`);
  }
  cached = parsed.data;
  return cached;
}
