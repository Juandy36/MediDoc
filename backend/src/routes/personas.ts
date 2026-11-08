import { type AuditEntry, type PersonSummary, createPersonSchema, updatePersonSchema } from "@medidoc/shared";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { assertAccess } from "../access";
import { audit } from "../audit";
import { fieldCipher } from "../crypto";
import { db } from "../db";
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
