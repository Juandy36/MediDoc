import { HTTPException } from "hono/http-exception";
import { db } from "./db";
import type { Role } from "./generated/prisma/enums";

const RANK: Record<Role, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };

export function roleAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

/**
 * Comprueba en BD que el usuario tiene al menos `minRole` sobre la persona.
 * - Sin acceso: 404 (no revelamos si la persona existe).
 * - Con acceso pero rol insuficiente: 403.
 * Devuelve el rol real para que la ruta pueda decidir detalles.
 */
export async function assertAccess(userId: string, personId: string, minRole: Role): Promise<Role> {
  const membership = await db().membership.findUnique({
    where: { userId_personId: { userId, personId } },
    select: { role: true },
  });
  if (!membership) throw new HTTPException(404, { message: "not_found" });
  if (!roleAtLeast(membership.role, minRole)) throw new HTTPException(403, { message: "forbidden" });
  return membership.role;
}
