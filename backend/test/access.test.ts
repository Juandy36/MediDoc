import { HTTPException } from "hono/http-exception";
import { afterAll, describe, expect, it } from "vitest";
import { assertAccess } from "../src/access";
import { fixtures } from "./helpers";

const fx = fixtures();
afterAll(() => fx.cleanup());

async function statusOf(p: Promise<unknown>): Promise<number | "ok"> {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof HTTPException) return e.status;
    throw e;
  }
}

describe("assertAccess", () => {
  it("sin Membership: 404 aunque la persona exista", async () => {
    const [u, p] = await Promise.all([fx.user(), fx.person()]);
    expect(await statusOf(assertAccess(u.id, p.id, "VIEWER"))).toBe(404);
  });

  it("VIEWER puede ver, pero no subir ni borrar", async () => {
    const [u, p] = await Promise.all([fx.user(), fx.person()]);
    await fx.grant(u.id, p.id, "VIEWER");
    expect(await statusOf(assertAccess(u.id, p.id, "VIEWER"))).toBe("ok");
    expect(await statusOf(assertAccess(u.id, p.id, "EDITOR"))).toBe(403);
    expect(await statusOf(assertAccess(u.id, p.id, "OWNER"))).toBe(403);
  });

  it("EDITOR puede subir, pero no borrar", async () => {
    const [u, p] = await Promise.all([fx.user(), fx.person()]);
    await fx.grant(u.id, p.id, "EDITOR");
    expect(await statusOf(assertAccess(u.id, p.id, "EDITOR"))).toBe("ok");
    expect(await statusOf(assertAccess(u.id, p.id, "OWNER"))).toBe(403);
  });

  it("OWNER puede todo", async () => {
    const [u, p] = await Promise.all([fx.user(), fx.person()]);
    await fx.grant(u.id, p.id, "OWNER");
    expect(await statusOf(assertAccess(u.id, p.id, "OWNER"))).toBe("ok");
  });

  it("el acceso a una persona no da acceso a otra", async () => {
    const [u, p1, p2] = await Promise.all([fx.user(), fx.person(), fx.person()]);
    await fx.grant(u.id, p1.id, "OWNER");
    expect(await statusOf(assertAccess(u.id, p2.id, "VIEWER"))).toBe(404);
  });
});
