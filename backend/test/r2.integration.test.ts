import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

// Prueba contra el bucket real de desarrollo. Se omite si R2 no está configurado.
const configured = Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET);
const isProdBucket = /prod/i.test(process.env.R2_BUCKET ?? "");

describe.skipIf(!configured || isProdBucket)("R2 (bucket de desarrollo)", () => {
  it("firma subida, sube, verifica, copia, descarga y borra", async () => {
    const storage = await import("../src/storage");
    const id = randomBytes(8).toString("hex");
    const tmp = `pending/_test/${id}`;
    const final = `_test/${id}.pdf`;
    const pdf = new TextEncoder().encode("%PDF-1.7\n% prueba MediDoc\n");

    try {
      const putUrl = await storage.presignUpload(tmp, "application/pdf");
      const put = await fetch(putUrl, { method: "PUT", headers: { "content-type": "application/pdf" }, body: pdf });
      expect(put.status).toBe(200);

      expect(await storage.headObject(tmp)).toEqual({ size: pdf.length });
      expect(new TextDecoder().decode(await storage.readFirstBytes(tmp, 5))).toBe("%PDF-");

      await storage.copyObject(tmp, final);
      const getUrl = await storage.presignDownload(final, { filename: "Exámen de prueba.pdf", contentType: "application/pdf", inline: false });
      const get = await fetch(getUrl);
      expect(get.status).toBe(200);
      expect(get.headers.get("cache-control")).toBe("private, no-store");
      expect(get.headers.get("content-disposition")).toContain("attachment");
      expect(new Uint8Array(await get.arrayBuffer())).toEqual(pdf);

      // Sin firma, el bucket privado no entrega nada.
      const anon = await fetch(getUrl.split("?")[0]!);
      expect(anon.ok).toBe(false);
    } finally {
      await storage.deleteObject(tmp).catch(() => {});
      await storage.deleteObject(final).catch(() => {});
    }
    expect(await storage.headObject(final)).toBeNull();
  });
});
