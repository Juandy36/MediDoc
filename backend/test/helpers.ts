import { randomBytes } from "node:crypto";
import { db } from "../src/db";
import type { Role } from "../src/generated/prisma/enums";

/** Registra todo lo que crea una prueba para borrarlo al final. */
export function fixtures() {
  const userIds: string[] = [];
  const personIds: string[] = [];

  const testEmail = () => `t-${randomBytes(6).toString("hex")}@medidoc.test`;

  return {
    testEmail,
    async user(email = testEmail()) {
      const u = await db().user.create({ data: { email } });
      userIds.push(u.id);
      return u;
    },
    async person(name = "v1:ficticio") {
      const p = await db().person.create({ data: { name } });
      personIds.push(p.id);
      return p;
    },
    async grant(userId: string, personId: string, role: Role) {
      return db().membership.create({ data: { userId, personId, role } });
    },
    trackPerson: (id: string) => {
      personIds.push(id);
    },
    trackUserByEmail: async (email: string) => {
      const u = await db().user.findUnique({ where: { email } });
      if (u) userIds.push(u.id);
    },
    async cleanup() {
      // Personas primero (borra Memberships e Invitations en cascada), luego usuarios (y sus sesiones).
      await db().person.deleteMany({ where: { id: { in: personIds } } });
      await db().user.deleteMany({ where: { id: { in: userIds } } });
      await db().auditLog.deleteMany({ where: { OR: [{ personId: { in: personIds } }, { userId: { in: userIds } }] } });
    },
  };
}

export const ORIGIN = "http://localhost:3000";

/** Usuario de prueba con sesión y un cliente HTTP que envía su cookie. */
export async function apiClient(fx: ReturnType<typeof fixtures>) {
  const { createSession } = await import("../src/auth/session");
  const { default: app } = await import("../src/index");
  const user = await fx.user();
  const { token } = await createSession(user.id);
  const call = (method: string, path: string, body?: unknown) =>
    app.request(`/api${path}`, {
      method,
      headers: { cookie: `medidoc_session=${token}`, origin: ORIGIN, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { user, token, call };
}

/** Crea una persona vía API (el cliente queda como OWNER) y la registra para limpieza. */
export async function apiCreatePerson(
  fx: ReturnType<typeof fixtures>,
  owner: Awaited<ReturnType<typeof apiClient>>,
  name = "Ana Pérez",
) {
  const res = await owner.call("POST", "/personas", { name, birthDate: "2015-03-09" });
  if (res.status !== 201) throw new Error(`crear persona: ${res.status}`);
  const { person } = (await res.json()) as { person: { id: string; name: string; birthDate: string | null; role: Role } };
  fx.trackPerson(person.id);
  return person;
}
