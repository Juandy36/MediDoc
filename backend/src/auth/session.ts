import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";

export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000; // 24 h sin actividad
const TOUCH_EVERY_MS = 5 * 60 * 1000; // no escribir lastSeenAt en cada petición

export type SessionUser = { id: string; email: string; name: string | null };

/** En BD solo se guarda el sha256 del token: si se filtra la tabla, no sirve para entrar. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_MS);
  await db().session.create({ data: { id: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function validateSession(token: string): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const id = hashToken(token);
  const session = await db().session.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now || session.lastSeenAt.getTime() + SESSION_IDLE_MS <= now) {
    await db().session.deleteMany({ where: { id } });
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db().session.update({ where: { id }, data: { lastSeenAt: new Date(now) } });
  }
  return session.user;
}

export async function deleteSession(token: string): Promise<void> {
  await db().session.deleteMany({ where: { id: hashToken(token) } });
}

export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  await db().session.deleteMany({ where: { userId } });
}
