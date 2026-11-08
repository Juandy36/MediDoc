import type { PersonSummary } from "@medidoc/shared";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../src/db";
import app from "../src/index";
import { apiClient, apiCreatePerson, fixtures } from "./helpers";

const fx = fixtures();
afterAll(() => fx.cleanup());

const client = () => apiClient(fx);
const createPerson = (owner: Awaited<ReturnType<typeof client>>, name?: string) => apiCreatePerson(fx, owner, name);

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
        expect((await editor.call("GET", `/personas/${person.id}/actividad`)).status).toBe(403);
  });

  it("OWNER puede borrar una persona sin documentos", async () => {
    const owner = await client();
    const person = await createPerson(owner);
    expect((await owner.call("DELETE", `/personas/${person.id}`)).status).toBe(200);
    expect(await db().person.findUnique({ where: { id: person.id } })).toBeNull();
  });
});
