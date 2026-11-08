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

export const requestUploadSchema = documentMetaSchema.extend({
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
});

export const updatePersonSchema = z.object({
  name: z.string().trim().min(1).max(120),
  birthDate: dateOnlySchema.nullable(),
});

export const inviteSchema = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  role: roleSchema,
});

export const changeRoleSchema = z.object({ role: roleSchema });

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

export type AccessEntry = {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  isMe: boolean;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
};

export type AccessList = { members: AccessEntry[]; invitations: PendingInvitation[] };

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
