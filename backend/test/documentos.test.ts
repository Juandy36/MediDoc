import type { DocumentSummary, UploadTicket } from "@medidoc/shared";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/db";
import { apiClient, apiCreatePerson, fixtures } from "./helpers";

// Almacenamiento simulado en memoria (las pruebas no tocan R2).
const store = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock("../src/storage", () => ({
  presignUpload: async (key: string) => `https://r2.test/upload/${key}`,
  presignDownload: async (key: string, o: { filename: string; inline: boolean }) =>
    `https://r2.test/get/${key}?inline=${o.inline}&name=${encodeURIComponent(o.filename)}`,
  headObject: async (key: string) => (store.has(key) ? { size: store.get(key)!.length } : null),
  readFirstBytes: async (key: string, n = 16) => store.get(key)!.slice(0, n),
  copyObject: async (from: string, to: string) => void store.set(to, store.get(from)!),
  deleteObject: async (key: string) => void store.delete(key),
}));

const fx = fixtures();
afterAll(() => fx.cleanup());
beforeEach(() => store.clear());

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]);

type Client = Awaited<ReturnType<typeof apiClient>>;
const meta = { title: "Hemograma completo", category: "LABORATORIO", examDate: "2026-03-01", notes: "Ayunas" };

/** Simula el flujo completo: pedir URL, "subir" bytes y confirmar. */
async function upload(c: Client, personId: string, bytes: Uint8Array, mimeType = "application/pdf", extra = {}) {
  const t = await c.call("POST", `/personas/${personId}/documentos/subidas`, { mimeType, sizeBytes: bytes.length });
  if (t.status !== 201) return t;
  const ticket = (await t.json()) as UploadTicket;
  store.set(`pending/${personId}/${ticket.uploadId}`, bytes);
  return c.call("POST", `/personas/${personId}/documentos`, { ...meta, ...extra, uploadId: ticket.uploadId });
}

async function setup() {
  const owner = await apiClient(fx);
  const person = await apiCreatePerson(fx, owner);
  return { owner, person };
}

describe("documentos", () => {
  it("subir: registra el documento cifrado y mueve el archivo fuera de pending/", async () => {
    const { owner, person } = await setup();
    const res = await upload(owner, person.id, PDF);
    expect(res.status).toBe(201);
    const { document } = (await res.json()) as { document: DocumentSummary };
    expect(document).toMatchObject({ title: "Hemograma completo", examDate: "2026-03-01", mimeType: "application/pdf", sizeBytes: PDF.length });

    const raw = await db().document.findUniqueOrThrow({ where: { id: document.id } });
    expect(raw.title).not.toContain("Hemograma");
    expect(raw.notes).not.toContain("Ayunas");
    expect(raw.storageKey).toMatch(new RegExp(`^${person.id}/[a-f0-9]{24}\\.pdf$`));
    expect(store.has(raw.storageKey)).toBe(true);
    expect([...store.keys()].some((k) => k.startsWith("pending/"))).toBe(false);
  });

  it("la fecha del examen no se desfasa", async () => {
    const { owner, person } = await setup();
    await upload(owner, person.id, PDF, "application/pdf", { examDate: "2026-01-01" });
    const list = (await (await owner.call("GET", `/personas/${person.id}/documentos`)).json()) as { documents: DocumentSummary[] };
    expect(list.documents[0]!.examDate).toBe("2026-01-01");
  });

  it("identifica el tipo real por su contenido, no por lo que dice el navegador", async () => {
    const { owner, person } = await setup();
    const res = await upload(owner, person.id, PNG, "application/pdf");
    expect(((await res.json()) as { document: DocumentSummary }).document.mimeType).toBe("image/png");
  });

  it("rechaza archivos que no son PDF/JPG/PNG y los borra", async () => {
    const { owner, person } = await setup();
    const res = await upload(owner, person.id, EXE);
    expect(res.status).toBe(400);
    expect(store.size).toBe(0);
    expect(await db().document.count({ where: { personId: person.id } })).toBe(0);
  });

  it("rechaza tipos y tamaños no permitidos antes de firmar", async () => {
    const { owner, person } = await setup();
    const big = await owner.call("POST", `/personas/${person.id}/documentos/subidas`, { mimeType: "application/pdf", sizeBytes: 16 * 1024 * 1024 });
    expect(big.status).toBe(400);
    const exe = await owner.call("POST", `/personas/${person.id}/documentos/subidas`, { mimeType: "application/x-msdownload", sizeBytes: 10 });
    expect(exe.status).toBe(400);
  });

  it("confirmar sin haber subido el archivo falla", async () => {
    const { owner, person } = await setup();
    const res = await owner.call("POST", `/personas/${person.id}/documentos`, { ...meta, uploadId: "a".repeat(32) });
    expect(res.status).toBe(400);
  });

  it("no se puede confirmar una subida en otra persona", async () => {
    const { owner, person } = await setup();
    const other = await apiCreatePerson(fx, owner, "Otra");
    const t = (await (await owner.call("POST", `/personas/${person.id}/documentos/subidas`, { mimeType: "application/pdf", sizeBytes: 5 })).json()) as UploadTicket;
    store.set(`pending/${person.id}/${t.uploadId}`, PDF);
    const res = await owner.call("POST", `/personas/${other.id}/documentos`, { ...meta, uploadId: t.uploadId });
    expect(res.status).toBe(400);
  });

  it("permisos: VIEWER ve y descarga; no sube, edita ni borra. EDITOR no borra", async () => {
    const { owner, person } = await setup();
    const viewer = await apiClient(fx);
    const editor = await apiClient(fx);
    const stranger = await apiClient(fx);
    await fx.grant(viewer.user.id, person.id, "VIEWER");
    await fx.grant(editor.user.id, person.id, "EDITOR");
    const { document } = (await (await upload(owner, person.id, PDF)).json()) as { document: DocumentSummary };

    expect((await viewer.call("GET", `/personas/${person.id}/documentos`)).status).toBe(200);
    expect((await viewer.call("GET", `/documentos/${document.id}/archivo`)).status).toBe(302);
    expect((await upload(viewer, person.id, PDF)).status).toBe(403);
    expect((await viewer.call("PATCH", `/documentos/${document.id}`, meta)).status).toBe(403);
    expect((await viewer.call("DELETE", `/documentos/${document.id}`)).status).toBe(403);

    expect((await upload(editor, person.id, PDF)).status).toBe(201);
    expect((await editor.call("PATCH", `/documentos/${document.id}`, { ...meta, title: "Nuevo" })).status).toBe(200);
    expect((await editor.call("DELETE", `/documentos/${document.id}`)).status).toBe(403);

    expect((await stranger.call("GET", `/personas/${person.id}/documentos`)).status).toBe(404);
    expect((await stranger.call("GET", `/documentos/${document.id}/archivo`)).status).toBe(404);
  });

  it("descargar: redirige a URL firmada y registra la consulta", async () => {
    const { owner, person } = await setup();
    const { document } = (await (await upload(owner, person.id, PDF)).json()) as { document: DocumentSummary };
    const res = await owner.call("GET", `/documentos/${document.id}/archivo?modo=ver`);
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("inline=true");
    expect(decodeURIComponent(loc)).toContain("2026-03-01 Hemograma completo.pdf");
    const views = await db().auditLog.count({ where: { documentId: document.id, action: "VIEW" } });
    expect(views).toBe(1);
  });

  it("borrar: OWNER lo oculta (soft delete), el archivo se conserva", async () => {
    const { owner, person } = await setup();
    const { document } = (await (await upload(owner, person.id, PDF)).json()) as { document: DocumentSummary };
    expect((await owner.call("DELETE", `/documentos/${document.id}`)).status).toBe(200);

    const list = (await (await owner.call("GET", `/personas/${person.id}/documentos`)).json()) as { documents: DocumentSummary[] };
    expect(list.documents).toHaveLength(0);
    expect((await owner.call("GET", `/documentos/${document.id}/archivo`)).status).toBe(404);
    const raw = await db().document.findUniqueOrThrow({ where: { id: document.id } });
    expect(raw.deletedAt).not.toBeNull();
    expect(store.has(raw.storageKey)).toBe(true);
  });
});
