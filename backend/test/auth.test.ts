import { afterAll, describe, expect, it } from "vitest";
import { finalizeLogin, isEmailAllowed } from "../src/auth/allow";
import {
  SESSION_IDLE_MS,
  createSession,
  deleteSession,
  hashToken,
  validateSession,
} from "../src/auth/session";
import { db } from "../src/db";
import app from "../src/index";
import { fixtures } from "./helpers";

const fx = fixtures();
afterAll(() => fx.cleanup());

describe("sesiones", () => {
  it("guarda solo el hash del token y valida la sesión", async () => {
    const u = await fx.user();
    const { token } = await createSession(u.id);

    expect(await db().session.findUnique({ where: { id: token } })).toBeNull();
    expect(await db().session.findUnique({ where: { id: hashToken(token) } })).not.toBeNull();
    expect((await validateSession(token))?.id).toBe(u.id);
  });

  it("rechaza y borra una sesión expirada", async () => {
    const u = await fx.user();
    const { token } = await createSession(u.id);
    await db().session.update({ where: { id: hashToken(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await validateSession(token)).toBeNull();
    expect(await db().session.findUnique({ where: { id: hashToken(token) } })).toBeNull();
  });

  it("rechaza una sesión inactiva más de 24 h", async () => {
    const u = await fx.user();
    const { token } = await createSession(u.id);
    await db().session.update({
      where: { id: hashToken(token) },
      data: { lastSeenAt: new Date(Date.now() - SESSION_IDLE_MS - 1000) },
    });
    expect(await validateSession(token)).toBeNull();
  });

  it("rechaza tokens inventados y sesiones cerradas", async () => {
    expect(await validateSession("inventado")).toBeNull();
    const u = await fx.user();
    const { token } = await createSession(u.id);
    await deleteSession(token);
    expect(await validateSession(token)).toBeNull();
  });
});

describe("quién puede entrar", () => {
  it("un correo desconocido no puede entrar", async () => {
    expect(await isEmailAllowed(fx.testEmail())).toBe(false);
  });

  it("un admin puede entrar (sin distinguir mayúsculas)", async () => {
    expect(await isEmailAllowed("ADMIN@medidoc.test")).toBe(true);
  });

  it("un invitado puede entrar y al hacer login recibe su Membership", async () => {
    const owner = await fx.user();
    const person = await fx.person();
    const email = fx.testEmail();
    await db().invitation.create({ data: { email, personId: person.id, role: "VIEWER", invitedBy: owner.id } });

    expect(await isEmailAllowed(email)).toBe(true);
    const user = await finalizeLogin(email.toUpperCase(), "Invitado");
    await fx.trackUserByEmail(email);

    expect(user.email).toBe(email);
    const m = await db().membership.findUnique({ where: { userId_personId: { userId: user.id, personId: person.id } } });
    expect(m?.role).toBe("VIEWER");
    const inv = await db().invitation.findFirst({ where: { email, personId: person.id } });
    expect(inv?.acceptedAt).not.toBeNull();
  });
});

describe("rutas /api/auth", () => {
  const origin = "http://localhost:3000";
  const cookieFor = (token: string) => `medidoc_session=${token}`;

  it("/me sin sesión devuelve 401", async () => {
    const res = await app.request("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("/me con sesión devuelve el usuario y no se cachea", async () => {
    const u = await fx.user();
    const { token } = await createSession(u.id);
    const res = await app.request("/api/auth/me", { headers: { cookie: cookieFor(token) } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(((await res.json()) as { user: { email: string } }).user.email).toBe(u.email);
  });

  it("logout sin Origin propio se rechaza (CSRF)", async () => {
    const u = await fx.user();
    const { token } = await createSession(u.id);
    const res = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { cookie: cookieFor(token), origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
    expect(await validateSession(token)).not.toBeNull();
  });

  it("logout desde nuestro origen cierra la sesión", async () => {
    const u = await fx.user();
    const { token } = await createSession(u.id);
    const res = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { cookie: cookieFor(token), origin },
    });
    expect(res.status).toBe(200);
    expect(await validateSession(token)).toBeNull();
  });

  it("el login redirige a Google con PKCE y state", async () => {
    const res = await app.request("/api/auth/google/login");
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.hostname).toBe("accounts.google.com");
    expect(loc.searchParams.get("code_challenge_method")).toBe("S256");
    expect(loc.searchParams.get("state")).toBeTruthy();
    expect(loc.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/google/callback`);
    expect(res.headers.get("set-cookie")).toMatch(/medidoc_oauth=.*HttpOnly/i);
  });

  it("el callback sin cookie de flujo vuelve al login", async () => {
    const res = await app.request("/api/auth/google/callback?code=x&state=y");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${origin}/login?error=expired`);
  });
});
