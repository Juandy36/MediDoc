import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Formato: v1:<iv b64>:<authTag b64>:<ciphertext b64>
const VERSION = "v1";
const ALGO = "aes-256-gcm";

function loadKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("La clave de cifrado debe tener 32 bytes");
  return key;
}

export function createFieldCipher(base64Key: string) {
  const key = loadKey(base64Key);

  function encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, key, iv);
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
  }

  function decrypt(payload: string): string {
    const [version, iv, tag, ct] = payload.split(":");
    if (version !== VERSION || !iv || !tag || ct === undefined) {
      throw new Error("Formato de campo cifrado inválido");
    }
    const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
  }

  return {
    encrypt,
    decrypt,
    encryptOptional: (v: string | null | undefined) => (v == null ? null : encrypt(v)),
    decryptOptional: (v: string | null | undefined) => (v == null ? null : decrypt(v)),
  };
}
