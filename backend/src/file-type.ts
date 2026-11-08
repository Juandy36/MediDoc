import type { AllowedMimeType } from "@medidoc/shared";

/**
 * Identifica el tipo real por sus "magic bytes", sin fiarse de la extensión
 * ni del Content-Type que declara el navegador.
 */
export function sniffMimeType(bytes: Uint8Array): AllowedMimeType | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

export const EXTENSION: Record<AllowedMimeType, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};
