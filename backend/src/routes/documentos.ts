import { randomBytes } from "node:crypto";
import {
  type DocumentSummary,
  type UploadTicket,
  MAX_FILE_BYTES,
  confirmUploadSchema,
  documentMetaSchema,
  uploadRequestSchema,
} from "@medidoc/shared";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { assertAccess } from "../access";
import { audit } from "../audit";
import type { SessionUser } from "../auth/session";
import { fieldCipher } from "../crypto";
import { db } from "../db";
import { EXTENSION, sniffMimeType } from "../file-type";
import type { Document } from "../generated/prisma/client";
import { requireUser } from "../middleware";
import * as storage from "../storage";
import { parseBody } from "../validate";

type Env = { Variables: { user: SessionUser } };
export const documentosRoutes = new Hono<Env>();

// Fechas de calendario: "YYYY-MM-DD" <-> @db.Date (medianoche UTC). Nunca pasan por la zona local.
const toDbDate = (d: string) => new Date(`${d}T00:00:00.000Z`);
const fromDbDate = (d: Date) => d.toISOString().slice(0, 10);

const pendingKey = (personId: string, uploadId: string) => `pending/${personId}/${uploadId}`;

function toSummary(d: Document): DocumentSummary {
  return {
    id: d.id,
    title: fieldCipher().decrypt(d.title),
    category: d.category,
    examDate: fromDbDate(d.examDate),
    notes: fieldCipher().decryptOptional(d.notes),
    mimeType: d.mimeType as DocumentSummary["mimeType"],
    sizeBytes: d.sizeBytes,
    createdAt: d.createdAt.toISOString(),
  };
}

/** Carga un documento no borrado y comprueba el rol sobre su persona. */
async function loadDocument(userId: string, docId: string, minRole: "VIEWER" | "EDITOR" | "OWNER") {
  const doc = await db().document.findFirst({ where: { id: docId, deletedAt: null } });
  if (!doc) throw new HTTPException(404, { message: "not_found" });
  await assertAccess(userId, doc.personId, minRole);
  return doc;
}

// ---------- Por persona ----------

documentosRoutes.get("/personas/:id/documentos", requireUser, async (c) => {
  const personId = c.req.param("id");
  await assertAccess(c.var.user.id, personId, "VIEWER");
  const docs = await db().document.findMany({
    where: { personId, deletedAt: null },
    orderBy: [{ examDate: "desc" }, { createdAt: "desc" }],
  });
  return c.json({ documents: docs.map(toSummary) });
});

/** Paso 1: URL firmada (5 min) para subir el archivo directo a R2, a una carpeta temporal. */
documentosRoutes.post("/personas/:id/documentos/subidas", requireUser, async (c) => {
  const personId = c.req.param("id");
  await assertAccess(c.var.user.id, personId, "EDITOR");
  const { mimeType } = await parseBody(c, uploadRequestSchema);
  const uploadId = randomBytes(16).toString("hex");
  const ticket: UploadTicket = {
    uploadId,
    url: await storage.presignUpload(pendingKey(personId, uploadId), mimeType),
    headers: { "content-type": mimeType },
  };
  return c.json(ticket, 201);
});

/** Paso 2: verifica el archivo subido y registra el documento. */
documentosRoutes.post("/personas/:id/documentos", requireUser, async (c) => {
  const personId = c.req.param("id");
  const userId = c.var.user.id;
  await assertAccess(userId, personId, "EDITOR");
  const input = await parseBody(c, confirmUploadSchema);
  const tmpKey = pendingKey(personId, input.uploadId);

  const head = await storage.headObject(tmpKey);
  if (!head) throw new HTTPException(400, { message: "upload_missing" });
  if (head.size === 0 || head.size > MAX_FILE_BYTES) {
    await storage.deleteObject(tmpKey);
    throw new HTTPException(400, { message: "file_too_large" });
  }
  const mimeType = sniffMimeType(await storage.readFirstBytes(tmpKey));
  if (!mimeType) {
    await storage.deleteObject(tmpKey);
    throw new HTTPException(400, { message: "file_type" });
  }

  const storageKey = `${personId}/${randomBytes(12).toString("hex")}.${EXTENSION[mimeType]}`;
  await storage.copyObject(tmpKey, storageKey);
  let doc: Document;
  try {
    doc = await db().$transaction(async (tx) => {
      const d = await tx.document.create({
        data: {
          personId,
          title: fieldCipher().encrypt(input.title),
          category: input.category,
          examDate: toDbDate(input.examDate),
          notes: fieldCipher().encryptOptional(input.notes || null),
          storageKey,
          mimeType,
          sizeBytes: head.size,
          uploadedBy: userId,
        },
      });
      await audit({ userId, action: "UPLOAD", personId, documentId: d.id }, tx);
      return d;
    });
  } catch (err) {
    await storage.deleteObject(storageKey).catch(() => {}); // sin registro, no debe quedar archivo
    throw err;
  }
  await storage.deleteObject(tmpKey).catch(() => {});
  return c.json({ document: toSummary(doc) }, 201);
});

// ---------- Por documento ----------

/** Redirige a una URL firmada de 60 s. ?modo=ver lo abre en el navegador; si no, lo descarga. */
documentosRoutes.get("/documentos/:docId/archivo", requireUser, async (c) => {
  const userId = c.var.user.id;
  const doc = await loadDocument(userId, c.req.param("docId"), "VIEWER");
  const summary = toSummary(doc);
  const safeTitle = summary.title.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 80) || "documento";
  const url = await storage.presignDownload(doc.storageKey, {
    filename: `${summary.examDate} ${safeTitle}.${EXTENSION[summary.mimeType]}`,
    contentType: doc.mimeType,
    inline: c.req.query("modo") === "ver",
  });
  await audit({ userId, action: "VIEW", personId: doc.personId, documentId: doc.id });
  return c.redirect(url, 302);
});

documentosRoutes.patch("/documentos/:docId", requireUser, async (c) => {
  const userId = c.var.user.id;
  const doc = await loadDocument(userId, c.req.param("docId"), "EDITOR");
  const input = await parseBody(c, documentMetaSchema);
  const updated = await db().$transaction(async (tx) => {
    const d = await tx.document.update({
      where: { id: doc.id },
      data: {
        title: fieldCipher().encrypt(input.title),
        category: input.category,
        examDate: toDbDate(input.examDate),
        notes: fieldCipher().encryptOptional(input.notes || null),
      },
    });
    await audit({ userId, action: "UPDATE", personId: doc.personId, documentId: doc.id }, tx);
    return d;
  });
  return c.json({ document: toSummary(updated) });
});

/** Borrado lógico: se oculta y el archivo se conserva (papelera de la fase 2). */
documentosRoutes.delete("/documentos/:docId", requireUser, async (c) => {
  const userId = c.var.user.id;
  const doc = await loadDocument(userId, c.req.param("docId"), "OWNER");
  await db().$transaction(async (tx) => {
    await tx.document.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
    await audit({ userId, action: "DELETE", personId: doc.personId, documentId: doc.id }, tx);
  });
  return c.json({ ok: true });
});
