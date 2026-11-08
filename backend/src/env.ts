import { z } from "zod";

const coreSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  APP_ORIGIN: z.url().transform((u) => u.replace(/\/$/, "")),
  ADMIN_EMAILS: z
    .string()
    .min(1)
    .transform((s) => s.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  FIELD_ENCRYPTION_KEY: z
    .string()
    .refine((k) => Buffer.from(k, "base64").length === 32, "Debe ser 32 bytes en base64"),
});

const storageSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
});

export type Env = z.infer<typeof coreSchema>;
export type StorageEnv = z.infer<typeof storageSchema>;

function parse<T extends z.ZodType>(schema: T): z.infer<T> {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Solo los nombres de las variables, nunca sus valores.
    const invalid = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Variables de entorno inválidas o ausentes: ${invalid}`);
  }
  return parsed.data;
}

let core: Env | undefined;
let storage: StorageEnv | undefined;

/** Variables obligatorias para arrancar la API. */
export function env(): Env {
  return (core ??= parse(coreSchema));
}

/** Variables de R2. Solo se validan cuando se usan archivos. */
export function storageEnv(): StorageEnv {
  return (storage ??= parse(storageSchema));
}

export const isSecureOrigin = () => env().APP_ORIGIN.startsWith("https://");
