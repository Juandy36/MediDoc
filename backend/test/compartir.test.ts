import type { ShareOverview } from "@medidoc/shared";
import { afterAll, describe, expect, it } from "vitest";
import { isEmailAllowed } from "../src/auth/allow";
import { validateSession } from "../src/auth/session";
import { db } from "../src/db";
import { apiClient, apiCreatePerson, fixtures } from "./helpers";

const fx = fixtures();
afterAll(() => fx.cleanup());

const client = () => apiClient(fx);
type Client = Awaited<ReturnType<typeof client>>;
const createPerson = (owner: Client, name?: string) => apiCreatePerson(fx, owner, name);
const overview = async (c: Client) => (await (await c.call("GET", "/compartir")).json()) as ShareOverview;

describe("compartir (una sola pantalla para todas las personas)", () => {
  it("la vista lista mis personas y quién tiene acceso, empezando por mí", async () => {
    const owner = await client();
    const a = await createPerson(owner, "Ledy");
    const b = await createPerson(owner, "Juan");
    const view = await overview(owner);
    expect(view.people.map((p) => p.name)).toEqual(["Juan", "Ledy"]);
    expect(view.accounts[0]).toMatchObject({ email: owner.user.email, isMe: true });
    expect(view.accounts[0]!.access).toEqual({ [a.id]: "OWNER", [b.id]: "OWNER" });
  });

  it("solo muestra personas de las que soy OWNER", async () => {
    const owner = await client();
    const viewer = await client();
    const p = await createPerson(owner);
    await fx.grant(viewer.user.id, p.id, "VIEWER");
    expect((await overview(viewer)).people).toHaveLength(0);
  });

  it("invitar un correo nuevo con permisos distintos por persona", async () => {
    const owner = await client();
    const a = await createPerson(owner, "Ledy");
    const b = await createPerson(owner, "Juan");
    const email = fx.testEmail();

    const res = await owner.call("PUT", "/compartir", { email: email.toUpperCase(), access: { [a.id]: "VIEWER", [b.id]: null } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("invited");
    expect(await isEmailAllowed(email)).toBe(true);

    const acc = (await overview(owner)).accounts.find((x) => x.email === email)!;
    expect(acc).toMatchObject({ pending: true, access: { [a.id]: "VIEWER" } });
    expect(acc.access[b.id]).toBeUndefined();
  });

  it("a un usuario existente le da acceso directo y se puede cambiar de una vez", async () => {
    const owner = await client();
    const other = await client();
    const a = await createPerson(owner);
    const b = await createPerson(owner);

    await owner.call("PUT", "/compartir", { email: other.user.email, access: { [a.id]: "EDITOR", [b.id]: "VIEWER" } });
    expect((await other.call("GET", `/personas/${a.id}`)).status).toBe(200);
    expect((await other.call("GET", `/personas/${b.id}`)).status).toBe(200);

    await owner.call("PUT", "/compartir", { email: other.user.email, access: { [a.id]: "VIEWER", [b.id]: null } });
    const acc = (await overview(owner)).accounts.find((x) => x.email === other.user.email)!;
    expect(acc).toMatchObject({ pending: false, access: { [a.id]: "VIEWER" } });
    expect((await other.call("GET", `/personas/${b.id}`)).status).toBe(404);
  });

  it("no puede tocar personas que no son suyas (404) ni cambiarse a sí mismo", async () => {
    const owner = await client();
    const stranger = await client();
    const mine = await createPerson(owner);
    const notMine = await createPerson(stranger);
    expect((await owner.call("PUT", "/compartir", { email: fx.testEmail(), access: { [mine.id]: "VIEWER", [notMine.id]: "VIEWER" } })).status).toBe(404);
    expect((await owner.call("PUT", "/compartir", { email: owner.user.email, access: { [mine.id]: "VIEWER" } })).status).toBe(400);
    // nada se aplicó a medias
    expect((await overview(owner)).accounts).toHaveLength(1);
  });

  it("valida la entrada", async () => {
    const owner = await client();
    const p = await createPerson(owner);
    expect((await owner.call("PUT", "/compartir", { email: "no-es-correo", access: { [p.id]: "VIEWER" } })).status).toBe(400);
    expect((await owner.call("PUT", "/compartir", { email: fx.testEmail(), access: {} })).status).toBe(400);
    expect((await owner.call("PUT", "/compartir", { email: fx.testEmail(), access: { [p.id]: "ADMIN" } })).status).toBe(400);
  });

  it("co-propietarios pueden ajustarse entre sí; quien deja de ser OWNER pierde el control", async () => {
    const owner = await client();
    const co = await client();
    const p = await createPerson(owner);
    // co-propietario: puede degradar a owner porque quedaría co
    await owner.call("PUT", "/compartir", { email: co.user.email, access: { [p.id]: "OWNER" } });
    expect((await co.call("PUT", "/compartir", { email: owner.user.email, access: { [p.id]: "VIEWER" } })).status).toBe(200);
    // ahora co es el único OWNER: owner (ya VIEWER) no puede tocar nada, y nadie puede quitar a co
    expect((await owner.call("PUT", "/compartir", { email: co.user.email, access: { [p.id]: null } })).status).toBe(404);
  });

  it("quitar todo cierra sus sesiones y le impide volver a entrar", async () => {
    const owner = await client();
    const guest = await client();
    const a = await createPerson(owner);
    const b = await createPerson(owner);
    await owner.call("PUT", "/compartir", { email: guest.user.email, access: { [a.id]: "VIEWER", [b.id]: "VIEWER" } });

    // quitar solo una: sigue dentro
    await owner.call("PUT", "/compartir", { email: guest.user.email, access: { [a.id]: null } });
    expect(await validateSession(guest.token)).not.toBeNull();

    // quitar la última: fuera
    await owner.call("PUT", "/compartir", { email: guest.user.email, access: { [b.id]: null } });
    expect(await validateSession(guest.token)).toBeNull();
    expect(await isEmailAllowed(guest.user.email)).toBe(false);
  });

  it("cancelar una invitación pendiente", async () => {
    const owner = await client();
    const p = await createPerson(owner);
    const email = fx.testEmail();
    await owner.call("PUT", "/compartir", { email, access: { [p.id]: "VIEWER" } });
    await owner.call("PUT", "/compartir", { email, access: { [p.id]: null } });
    expect(await db().invitation.count({ where: { email } })).toBe(0);
    expect(await isEmailAllowed(email)).toBe(false);
  });

  it("la actividad de cada persona registra el cambio", async () => {
    const owner = await client();
    const p = await createPerson(owner);
    await owner.call("PUT", "/compartir", { email: fx.testEmail(), access: { [p.id]: "VIEWER" } });
    const { entries } = (await (await owner.call("GET", `/personas/${p.id}/actividad`)).json()) as {
      entries: { action: string; userEmail: string }[];
    };
    expect(entries[0]).toMatchObject({ action: "SHARE", userEmail: owner.user.email });
  });
});
