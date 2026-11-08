import { type ShareOverview, type SharedAccount, shareSchema } from "@medidoc/shared";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { audit } from "../audit";
import { deleteAllSessionsForUser } from "../auth/session";
import type { SessionUser } from "../auth/session";
import { fieldCipher } from "../crypto";
import { db } from "../db";
import type { Prisma } from "../generated/prisma/client";
import { requireUser } from "../middleware";
import { parseBody } from "../validate";

type Env = { Variables: { user: SessionUser } };
export const compartirRoutes = new Hono<Env>();
compartirRoutes.use(requireUser);

/** IDs de las personas de las que el usuario es OWNER. */
async function ownedPersonIds(userId: string): Promise<string[]> {
  const rows = await db().membership.findMany({ where: { userId, role: "OWNER" }, select: { personId: true } });
  return rows.map((r) => r.personId);
}

/** Siempre debe quedar al menos un OWNER por persona. */
async function assertNotLastOwner(tx: Prisma.TransactionClient, personId: string, userId: string) {
  const owners = await tx.membership.findMany({ where: { personId, role: "OWNER" }, select: { userId: true } });
  if (owners.length === 1 && owners[0]!.userId === userId) {
    throw new HTTPException(409, { message: "last_owner" });
  }
}

/** Vista única: mis personas (como OWNER) y todas las cuentas con acceso a alguna de ellas. */
compartirRoutes.get("/", async (c) => {
  const me = c.var.user;
  const ids = await ownedPersonIds(me.id);
  const [people, members, invitations] = await Promise.all([
    db().person.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    db().membership.findMany({
      where: { personId: { in: ids } },
      include: { user: { select: { email: true, name: true } } },
    }),
    db().invitation.findMany({ where: { personId: { in: ids }, acceptedAt: null } }),
  ]);

  const accounts = new Map<string, SharedAccount>();
  const account = (email: string, name: string | null, pending: boolean) => {
    let a = accounts.get(email);
    if (!a) {
      a = { email, name, isMe: email === me.email, pending, access: {} };
      accounts.set(email, a);
    }
    return a;
  };
  for (const m of members) account(m.user.email, m.user.name, false).access[m.personId] = m.role;
  for (const i of invitations) account(i.email, null, true).access[i.personId] = i.role;

  const body: ShareOverview = {
    people: people
      .map((p) => ({ id: p.id, name: fieldCipher().decrypt(p.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
    accounts: [...accounts.values()].sort((a, b) =>
      a.isMe ? -1 : b.isMe ? 1 : a.email.localeCompare(b.email),
    ),
  };
  return c.json(body);
});

/**
 * Fija los permisos de un correo sobre varias personas de una vez.
 * Si la cuenta ya existe se actualizan sus Memberships; si no, sus invitaciones.
 */
compartirRoutes.put("/", async (c) => {
  const me = c.var.user;
  const { email, access } = await parseBody(c, shareSchema);
  if (email === me.email) throw new HTTPException(400, { message: "self_invite" });

  const owned = new Set(await ownedPersonIds(me.id));
  const entries = Object.entries(access);
  // Solo se pueden tocar personas de las que soy OWNER (404: no revelamos las demás).
  if (entries.some(([pid]) => !owned.has(pid))) throw new HTTPException(404, { message: "not_found" });

  const outcome = await db().$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email }, select: { id: true } });

    for (const [personId, role] of entries) {
      if (user) {
        const key = { userId_personId: { userId: user.id, personId } };
        const existing = await tx.membership.findUnique({ where: key });
        if (role === null) {
          if (!existing) continue;
          await assertNotLastOwner(tx, personId, user.id);
          await tx.membership.delete({ where: key });
          await tx.invitation.deleteMany({ where: { email, personId } });
          await audit({ userId: me.id, action: "UNSHARE", personId }, tx);
        } else {
          if (existing?.role === role) continue;
          if (existing?.role === "OWNER") await assertNotLastOwner(tx, personId, user.id);
          await tx.membership.upsert({ where: key, create: { userId: user.id, personId, role }, update: { role } });
          await audit({ userId: me.id, action: "SHARE", personId }, tx);
        }
      } else if (role === null) {
        const { count } = await tx.invitation.deleteMany({ where: { email, personId } });
        if (count > 0) await audit({ userId: me.id, action: "UNSHARE", personId }, tx);
      } else {
        await tx.invitation.upsert({
          where: { email_personId: { email, personId } },
          create: { email, personId, role, invitedBy: me.id },
          update: { role, invitedBy: me.id, acceptedAt: null },
        });
        await audit({ userId: me.id, action: "SHARE", personId }, tx);
      }
    }

    if (!user) return { status: "invited" as const, revokeUserId: null };
    const [memberships, invites] = await Promise.all([
      tx.membership.count({ where: { userId: user.id } }),
      tx.invitation.count({ where: { email } }),
    ]);
    return { status: "granted" as const, revokeUserId: memberships + invites === 0 ? user.id : null };
  });

  // Si ya no tiene acceso a nada, sus sesiones se cierran al instante.
  if (outcome.revokeUserId) await deleteAllSessionsForUser(outcome.revokeUserId);
  return c.json({ status: outcome.status });
});
