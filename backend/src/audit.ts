import type { AuditAction, Prisma } from "./generated/prisma/client";
import { db } from "./db";

type Client = Prisma.TransactionClient | ReturnType<typeof db>;

/** Registra una acción. Pasa `tx` para que quede en la misma transacción que el cambio. */
export function audit(
  entry: { userId: string; action: AuditAction; personId?: string; documentId?: string },
  client: Client = db(),
) {
  return client.auditLog.create({ data: entry });
}
