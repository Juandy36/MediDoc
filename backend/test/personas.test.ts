import type { AccessList, AuditEntry, PersonSummary } from "@medidoc/shared";
import { afterAll, describe, expect, it } from "vitest";
import { isEmailAllowed } from "../src/auth/allow";
import { createSession, validateSession } from "../src/auth/session";
import { db } from "../src/db";
import app from "../src/index";
import { fixtures } from "./helpers";

const fx = fixtures();
afterAll(() => fx.cleanup());

const ORIGIN = "http://localhost:3000";

/** Usuario de prueba con sesión y un cliente HTTP que envía su cookie. */
async function client() {
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

async function createPerson(owner: Awaited<ReturnType<typeof client>>, name = "Ana Pérez") {
  const res = await owner.call("POST", "/personas", { name, birthDate: "2015-03-09" });
  expect(res.status).toBe(201);
  const { person } = (await res.json()) as { person: PersonSummary };
  fx.trackPerson(person.id);
  return person;
}

describe("personas", () => {
  it("sin sesión: 401", async () => {
    expect((await app.request("/api/personas")).status).toBe(401);
  });

  it("crear: queda como OWNER y nombre/fecha se guardan cifrados", async () => {
    const owner = await client();
    const person = await createPerson(owner, "María José");
    expect(person).toMatchObject({ name: "María José", birthDate: "2015-03-09", role: "OWNER" });

    const raw = await db().person.findUniqueOrThrow({ where: { id: person.id } });
    expect(raw.name).not.toContain("María");
    expect(raw.name.startsWith("v1:")).toBe(true);
    expect(raw.birthDate).not.toContain("2015");

    const list = (await (await owner.call("GET", "/personas")).json()) as { people: PersonSummary[] };
    expect(list.people.map((p) => p.id)).toContain(person.id);
  });

  it("valida la entrada", async () => {
    const owner = await client();
    expect((await owner.call("POST", "/personas", { name: "" })).status).toBe(400);
    expect((await owner.call("POST", "/personas", { name: "X", birthDate: "09/03/2015" })).status).toBe(400);
  });

  it("otro usuario no la ve ni en la lista ni por id (404)", async () => {
    const owner = await client();
    const stranger = await client();
    const person = await createPerson(owner);
    const list = (await (await stranger.call("GET", "/personas")).json()) as { people: PersonSummary[] };
    expect(list.people).toHaveLength(0);
    expect((await stranger.call("GET", `/personas/${person.id}`)).status).toBe(404);
    expect((await stranger.call("PATCH", `/personas/${person.id}`, { name: "X", birthDate: null })).status).toBe(404);
  });

  it("VIEWER ve pero no edita; EDITOR edita pero no borra ni comparte", async () => {
    const owner = await client();
    const viewer = await client();
    const editor = await client();
    const person = await createPerson(owner);
    await fx.grant(viewer.user.id, person.id, "VIEWER");
    await fx.grant(editor.user.id, person.id, "EDITOR");

    expect((await viewer.call("GET", `/personas/${person.id}`)).status).toBe(200);
    expect((await viewer.call("PATCH", `/personas/${person.id}`, { name: "X", birthDate: null })).status).toBe(403);

    const edited = await editor.call("PATCH", `/personas/${person.id}`, { name: "Ana P.", birthDate: null });
    expect(edited.status).toBe(200);
    expect(((await edited.json()) as { person: PersonSummary }).person.name).toBe("Ana P.");
    expect((await editor.call("DELETE", `/personas/${person.id}`)).status).toBe(403);
    expect((await editor.call("GET", `/personas/${person.id}/accesos`)).status).toBe(403);
    expect((await editor.call("GET", `/personas/${person.id}/actividad`)).status).toBe(403);
  });

  it("OWNER puede borrar una persona sin documentos", async () => {
    const owner = await client();
    const person = await createPerson(owner);
    expect((await owner.call("DELETE", `/personas/${person.id}`)).status).toBe(200);
    expect(await db().person.findUnique({ where: { id: person.id } })).toBeNull();
  });
});

describe("compartir", () => {
  it("invitar un correo nuevo crea invitación que le permite entrar", async () => {
    const owner = await client();
    const person = await createPerson(owner);
    const email = fx.testEmail();
    const res = await owner.call("POST", `/personas/${person.id}/invitaciones`, { email: email.toUpperCase(), role: "VIEWER" });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { status: string }).status).toBe("invited");
    expect(await isEmailAllowed(email)).toBe(true);

    const access = (await (await owner.call("GET", `/personas/${person.id}/accesos`)).json()) as AccessList;
    expect(access.invitations.map((i) => i.email)).toEqual([email]);
  });

  it("invitar a un usuario existente le da acceso directo", async () => {
    const owner = await client();
    const other = await client();
    const person = await createPerson(owner);
    const res = await owner.call("POST", `/personas/${person.id}/invitaciones`, { email: other.user.email, role: "EDITOR" });
    expect(((await res.json()) as { status: string }).status).toBe("granted");
    expect((await other.call("GET", `/personas/${person.id}`)).status).toBe(200);
    // repetir: conflicto
    expect((await owner.call("POST", `/personas/${person.id}/invitaciones`, { email: other.user.email, role: "EDITOR" })).status).toBe(409);
  });

  it("no puede invitarse a sí mismo", async () => {
    const owner = await client();
    const person = await createPerson(owner);
    expect((await owner.call("POST", `/personas/${person.id}/invitaciones`, { email: owner.user.email, role: "VIEWER" })).status).toBe(400);
  });

  it("el último OWNER no puede quitarse ni degradarse", async () => {
    const owner = await client();
    const person = await createPerson(owner);
    expect((await owner.call("DELETE", `/personas/${person.id}/accesos/${owner.user.id}`)).status).toBe(409);
    expect((await owner.call("PATCH", `/personas/${person.id}/accesos/${owner.user.id}`, { role: "VIEWER" })).status).toBe(409);
  });

  it("quitar el acceso borra su invitación y, si se queda sin nada, cierra sus sesiones", async () => {
    const owner = await client();
    const guest = await client();
    const person = await createPerson(owner);
    await db().invitation.create({
      data: { email: guest.user.email, personId: person.id, role: "VIEWER", invitedBy: owner.user.id, acceptedAt: new Date() },
    });
    await fx.grant(guest.user.id, person.id, "VIEWER");

    expect((await owner.call("DELETE", `/personas/${person.id}/accesos/${guest.user.id}`)).status).toBe(200);
    expect((await guest.call("GET", `/personas/${person.id}`)).status).toBe(401); // sesión cerrada
    expect(await validateSession(guest.token)).toBeNull();
    expect(await isEmailAllowed(guest.user.email)).toBe(false);
  });

  it("cambiar rol y cancelar invitación pendiente", async () => {
    const owner = await client();
    const other = await client();
    const person = await createPerson(owner);
    await fx.grant(other.user.id, person.id, "VIEWER");
    expect((await owner.call("PATCH", `/personas/${person.id}/accesos/${other.user.id}`, { role: "EDITOR" })).status).toBe(200);
    expect((await other.call("PATCH", `/personas/${person.id}`, { name: "Z", birthDate: null })).status).toBe(200);

    await owner.call("POST", `/personas/${person.id}/invitaciones`, { email: fx.testEmail(), role: "VIEWER" });
    const access = (await (await owner.call("GET", `/personas/${person.id}/accesos`)).json()) as AccessList;
    const invId = access.invitations[0]!.id;
    expect((await owner.call("DELETE", `/personas/${person.id}/invitaciones/${invId}`)).status).toBe(200);
    expect((await owner.call("DELETE", `/personas/${person.id}/invitaciones/${invId}`)).status).toBe(404);
  });

  it("la actividad registra quién compartió", async () => {
    const owner = await client();
    const person = await createPerson(owner);
    await owner.call("POST", `/personas/${person.id}/invitaciones`, { email: fx.testEmail(), role: "VIEWER" });
    const { entries } = (await (await owner.call("GET", `/personas/${person.id}/actividad`)).json()) as { entries: AuditEntry[] };
    expect(entries[0]).toMatchObject({ action: "SHARE", userEmail: owner.user.email });
  });
});
