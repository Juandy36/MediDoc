import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFieldCipher } from "../src/crypto";

const key = randomBytes(32).toString("base64");

describe("createFieldCipher", () => {
  const c = createFieldCipher(key);

  it("cifra y descifra ida y vuelta", () => {
    const plain = "Hemograma completo — María José";
    const enc = c.encrypt(plain);
    expect(enc).not.toContain("Hemograma");
    expect(c.decrypt(enc)).toBe(plain);
  });

  it("usa un IV distinto en cada cifrado", () => {
    expect(c.encrypt("x")).not.toBe(c.encrypt("x"));
  });

  it("detecta manipulación del texto cifrado", () => {
    const [v, iv, tag] = c.encrypt("dato").split(":");
    const tampered = [v, iv, tag, Buffer.from("otro").toString("base64")].join(":");
    expect(() => c.decrypt(tampered)).toThrow();
  });

  it("no descifra con otra clave", () => {
    const other = createFieldCipher(randomBytes(32).toString("base64"));
    expect(() => other.decrypt(c.encrypt("dato"))).toThrow();
  });

  it("rechaza claves que no son de 32 bytes", () => {
    expect(() => createFieldCipher(randomBytes(16).toString("base64"))).toThrow();
  });

  it("maneja opcionales", () => {
    expect(c.encryptOptional(null)).toBeNull();
    expect(c.decryptOptional(c.encryptOptional("n"))).toBe("n");
  });
});
