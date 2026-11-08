import { db } from "../db";
import { env } from "../env";
import type { SessionUser } from "./session";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * No hay registro abierto. Puede entrar quien:
 *  - esté en ADMIN_EMAILS, o
 *  - tenga alguna invitación (pendiente o aceptada), o
 *  - conserve algún Membership.
 */
export async function isEmailAllowed(rawEmail: string): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (env().ADMIN_EMAILS.includes(email)) return true;

  const [invitation, membership] = await Promise.all([
    db().invitation.findFirst({ where: { email }, select: { id: true } }),
    db().membership.findFirst({ where: { user: { email } }, select: { userId: true } }),
  ]);
  return Boolean(invitation || membership);
}

/**
 * Crea o actualiza el usuario y convierte sus invitaciones pendientes en Memberships,
 * todo en una transacción.
 */
export async function finalizeLogin(rawEmail: string, name: string | null): Promise<SessionUser> {
  const email = normalizeEmail(rawEmail);
  return db().$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      create: { email, name },
      update: { name: name ?? undefined },
      select: { id: true, email: true, name: true },
    });

    const pending = await tx.invitation.findMany({ where: { email, acceptedAt: null } });
    for (const inv of pending) {
      // Si ya tenía acceso a esa persona, se respeta el rol existente.
      await tx.membership.upsert({
        where: { userId_personId: { userId: user.id, personId: inv.personId } },
        create: { userId: user.id, personId: inv.personId, role: inv.role },
        update: {},
      });
      await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    }
    return user;
  });
}
