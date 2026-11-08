// Schemas y tipos compartidos entre frontend y backend.
// NUNCA importar aquí nada de servidor (Prisma, secretos, node:crypto).
import { z } from "zod";

export const ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const CATEGORIES = ["LABORATORIO", "IMAGENOLOGIA", "RECETA", "OTRO"] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

export const CATEGORY_LABELS: Record<Category, string> = {
  LABORATORIO: "Laboratorio",
  IMAGENOLOGIA: "Imagenología",
  RECETA: "Receta",
  OTRO: "Otro",
};

export const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Fecha de calendario "YYYY-MM-DD" válida, sin zona horaria. */
export const dateOnlySchema = z.iso.date();

export const createPersonSchema = z.object({
  name: z.string().trim().min(1).max(120),
  birthDate: dateOnlySchema.optional(),
});

export const documentMetaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: categorySchema,
  examDate: dateOnlySchema,
  notes: z.string().trim().max(2000).optional(),
});

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Paso 1: pedir una URL firmada para subir el archivo directo al almacenamiento. */
export const uploadRequestSchema = z.object({
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
});

/** Paso 2: confirmar la subida y registrar el documento. */
export const confirmUploadSchema = documentMetaSchema.extend({
  uploadId: z.string().regex(/^[a-f0-9]{32}$/),
});

export type UploadTicket = { uploadId: string; url: string; headers: Record<string, string> };

export type DocumentSummary = {
  id: string;
  title: string;
  category: Category;
  examDate: string; // YYYY-MM-DD
  notes: string | null;
  mimeType: AllowedMimeType;
  sizeBytes: number;
  createdAt: string;
};

export const updatePersonSchema = z.object({
  name: z.string().trim().min(1).max(120),
  birthDate: dateOnlySchema.nullable(),
});

/** Permisos de una cuenta sobre varias personas a la vez. null = sin acceso. */
export const shareSchema = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  access: z
    .record(z.string().min(1).max(40), roleSchema.nullable())
    .refine((a) => Object.keys(a).length > 0 && Object.keys(a).length <= 200, "Sin personas"),
});
export type ShareInput = z.input<typeof shareSchema>;

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Propietario",
  EDITOR: "Editor",
  VIEWER: "Lector",
};

// ---- Respuestas de la API ----

export type PersonSummary = {
  id: string;
  name: string;
  birthDate: string | null;
  role: Role;
};

/** Una cuenta (o invitado que aún no ha entrado) y sus permisos por persona. */
export type SharedAccount = {
  email: string;
  name: string | null;
  isMe: boolean;
  /** true si nunca ha iniciado sesión: sus permisos son invitaciones pendientes. */
  pending: boolean;
  access: Record<string, Role>;
};

/** Personas de las que soy propietario y quién tiene acceso a ellas. */
export type ShareOverview = {
  people: { id: string; name: string }[];
  accounts: SharedAccount[];
};

export type AuditAction = "UPLOAD" | "VIEW" | "UPDATE" | "DELETE" | "SHARE" | "UNSHARE";

export type AuditEntry = {
  id: string;
  action: AuditAction;
  userEmail: string | null;
  documentId: string | null;
  createdAt: string;
};

/** Formatea "YYYY-MM-DD" como fecha local sin pasar por new Date(string), que interpreta UTC. */
export function formatDateOnly(value: string, locale = "es"): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
