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
