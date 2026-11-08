import {
  type AccessList,
  type AuditEntry,
  type PersonSummary,
  changeRoleSchema,
  createPersonSchema,
  inviteSchema,
  updatePersonSchema,
} from "@medidoc/shared";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { assertAccess } from "../access";
import { audit } from "../audit";
import { normalizeEmail } from "../auth/allow";
import { deleteAllSessionsForUser } from "../auth/session";
import { fieldCipher } from "../crypto";
import { db } from "../db";
import type { Prisma } from "../generated/prisma/client";
import type { SessionUser } from "../auth/session";
import { requireUser } from "../middleware";
import { parseBody } from "../validate";

type Env = { Variables: { user: SessionUser } };
export const personasRoutes = new Hono<Env>();
personasRoutes.use(requireUser);

const decryptPerson = (p: { id: string; name: string; birthDate: string | null }) => ({
  id: p.id,
  name: fieldCipher().decrypt(p.name),
  birthDate: fieldCipher().decryptOptional(p.birthDate),
});

/** Evita quedarse sin ningún OWNER: siempre debe quedar al menos uno. */
async function assertNotLastOwner(tx: Prisma.TransactionClient, personId: string, userId: string) {
  const owners = await tx.membership.findMany({ where: { personId, role: "OWNER" }, select: { userId: true } });
  if (owners.length === 1 && owners[0]!.userId === userId) {
    throw new HTTPException(409, { message: "last_owner" });
  }
}

// ---------- Personas ----------

personasRoutes.get("/", async (c) => {
  const memberships = await db().membership.findMany({
    where: { userId: c.var.user.id },
    include: { person: { select: { id: true, name: true, birthDate: true } } },
  });
  const people: PersonSummary[] = memberships
    .map((m) => ({ ...decryptPerson(m.person), role: m.role }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return c.json({ people });
});

personasRoutes.post("/", async (c) => {
  const input = await parseBody(c, createPersonSchema);
  const userId = c.var.user.id;
  const person = await db().$transaction(async (tx) => {
    const p = await tx.person.create({
      data: {
        name: fieldCipher().encrypt(input.name),
        birthDate: fieldCipher().encryptOptional(input.birthDate),
        memberships: { create: { userId, role: "OWNER" } },
      },
    });
    await audit({ userId, action: "UPDATE", personId: p.id }, tx);
    return p;
  });
  const body: PersonSummary = { ...decryptPerson(person), role: "OWNER" };
  return c.json({ person: body }, 201);
});

personasRoutes.get("/:id", async (c) => {
  const personId = c.req.param("id");
  const role = await assertAccess(c.var.user.id, personId, "VIEWER");
  const person = await db().person.findUniqueOrThrow({ where: { id: personId } });
  const body: PersonSummary = { ...decryptPerson(person), role };
  return c.json({ person: body });
});

personasRoutes.patch("/:id", async (c) => {
  const personId = c.req.param("id");
  const role = await assertAccess(c.var.user.id, personId, "EDITOR");
  const input = await parseBody(c, updatePersonSchema);
  const person = await db().$transaction(async (tx) => {
    const p = await tx.person.update({
      where: { id: personId },
      data: { name: fieldCipher().encrypt(input.name), birthDate: fieldCipher().encryptOptional(input.birthDate) },
    });
    await audit({ userId: c.var.user.id, action: "UPDATE", personId }, tx);
    return p;
  });
  const body: PersonSummary = { ...decryptPerson(person), role };
  return c.json({ person: body });
});

personasRoutes.delete("/:id", async (c) => {
  const personId = c.req.param("id");
  await assertAccess(c.var.user.id, personId, "OWNER");
  // Mientras tenga documentos (incluso en la papelera) no se borra: sus archivos se
  // eliminan primero desde la gestión de documentos.
  const docs = await db().document.count({ where: { personId } });
  if (docs > 0) throw new HTTPException(409, { message: "has_documents" });
  await db().person.delete({ where: { id: personId } });
  await audit({ userId: c.var.user.id, action: "DELETE" });
  return c.json({ ok: true });
});

// ---------- Compartir (solo OWNER) ----------

personasRoutes.get("/:id/accesos", async (c) => {
  const personId = c.req.param("id");
  await assertAccess(c.var.user.id, personId, "OWNER");
  const [members, invitations] = await Promise.all([
    db().membership.findMany({
      where: { personId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db().invitation.findMany({ where: { personId, acceptedAt: null }, orderBy: { createdAt: "asc" } }),
  ]);
  const body: AccessList = {
    members: members.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      isMe: m.userId === c.var.user.id,
    })),
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      createdAt: i.createdAt.toISOString(),
    })),
  };
  return c.json(body);
});

personasRoutes.post("/:id/invitaciones", async (c) => {
  const personId = c.req.param("id");
  const me = c.var.user;
  await assertAccess(me.id, personId, "OWNER");
  const { email, role } = await parseBody(c, inviteSchema);
  if (normalizeEmail(email) === me.email) throw new HTTPException(400, { message: "self_invite" });

  const result = await db().$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({ where: { email } });
    if (existingUser) {
      const already = await tx.membership.findUnique({
        where: { userId_personId: { userId: existingUser.id, personId } },
      });
      if (already) throw new HTTPException(409, { message: "already_member" });
      // Ya usa la app: recibe el acceso directamente.
      await tx.membership.create({ data: { userId: existingUser.id, personId, role } });
      await audit({ userId: me.id, action: "SHARE", personId }, tx);
      return "granted" as const;
    }
    // Aún no ha entrado nunca: la invitación le permitirá iniciar sesión.
    await tx.invitation.upsert({
      where: { email_personId: { email, personId } },
      create: { email, personId, role, invitedBy: me.id },
      update: { role, invitedBy: me.id, acceptedAt: null },
    });
    await audit({ userId: me.id, action: "SHARE", personId }, tx);
    return "invited" as const;
  });
  return c.json({ status: result }, 201);
});

personasRoutes.delete("/:id/invitaciones/:invId", async (c) => {
  const personId = c.req.param("id");
  await assertAccess(c.var.user.id, personId, "OWNER");
  const { count } = await db().invitation.deleteMany({
    where: { id: c.req.param("invId"), personId, acceptedAt: null },
  });
  if (count === 0) throw new HTTPException(404, { message: "not_found" });
  await audit({ userId: c.var.user.id, action: "UNSHARE", personId });
  return c.json({ ok: true });
});

personasRoutes.patch("/:id/accesos/:userId", async (c) => {
  const personId = c.req.param("id");
  const targetId = c.req.param("userId");
  await assertAccess(c.var.user.id, personId, "OWNER");
  const { role } = await parseBody(c, changeRoleSchema);
  await db().$transaction(async (tx) => {
    const m = await tx.membership.findUnique({ where: { userId_personId: { userId: targetId, personId } } });
    if (!m) throw new HTTPException(404, { message: "not_found" });
    if (m.role === "OWNER" && role !== "OWNER") await assertNotLastOwner(tx, personId, targetId);
    await tx.membership.update({ where: { userId_personId: { userId: targetId, personId } }, data: { role } });
    await audit({ userId: c.var.user.id, action: "SHARE", personId }, tx);
  });
  return c.json({ ok: true });
});

personasRoutes.delete("/:id/accesos/:userId", async (c) => {
  const personId = c.req.param("id");
  const targetId = c.req.param("userId");
  await assertAccess(c.var.user.id, personId, "OWNER");
  const lostAllAccess = await db().$transaction(async (tx) => {
    const m = await tx.membership.findUnique({
      where: { userId_personId: { userId: targetId, personId } },
      include: { user: { select: { email: true } } },
    });
    if (!m) throw new HTTPException(404, { message: "not_found" });
    await assertNotLastOwner(tx, personId, targetId);
    await tx.membership.delete({ where: { userId_personId: { userId: targetId, personId } } });
    // La invitación aceptada también se borra: si no, seguiría contando como permiso de entrada.
    await tx.invitation.deleteMany({ where: { email: m.user.email, personId } });
    await audit({ userId: c.var.user.id, action: "UNSHARE", personId }, tx);
    const remaining = await tx.membership.count({ where: { userId: targetId } });
    const invites = await tx.invitation.count({ where: { email: m.user.email } });
    return remaining === 0 && invites === 0;
  });
  // Si ya no tiene acceso a nada, se cierran sus sesiones al instante.
  if (lostAllAccess) await deleteAllSessionsForUser(targetId);
  return c.json({ ok: true });
});

// ---------- Actividad (solo OWNER) ----------

personasRoutes.get("/:id/actividad", async (c) => {
  const personId = c.req.param("id");
  await assertAccess(c.var.user.id, personId, "OWNER");
  const logs = await db().auditLog.findMany({
    where: { personId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const users = await db().user.findMany({
    where: { id: { in: [...new Set(logs.map((l) => l.userId))] } },
    select: { id: true, email: true },
  });
  const emailOf = new Map(users.map((u) => [u.id, u.email]));
  const entries: AuditEntry[] = logs.map((l) => ({
    id: l.id,
    action: l.action,
    userEmail: emailOf.get(l.userId) ?? null,
    documentId: l.documentId,
    createdAt: l.createdAt.toISOString(),
  }));
  return c.json({ entries });
});
