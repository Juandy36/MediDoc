import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { storageEnv } from "./env";

// Cloudflare R2 (API compatible con S3). El bucket es privado: solo se accede
// con URLs firmadas de corta duración que emite el backend tras comprobar permisos.

const UPLOAD_URL_TTL = 5 * 60; // segundos
const DOWNLOAD_URL_TTL = 60;

let client: S3Client | undefined;

function s3(): S3Client {
  const e = storageEnv();
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
    // Sin checksums automáticos: si no, la URL firmada exige cabeceras que el navegador no envía.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

const bucket = () => storageEnv().R2_BUCKET;

export async function presignUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), {
    expiresIn: UPLOAD_URL_TTL,
  });
}

export async function presignDownload(
  key: string,
  opts: { filename: string; contentType: string; inline: boolean },
): Promise<string> {
  const ascii = opts.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const disposition = `${opts.inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(opts.filename)}`;
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: disposition,
      ResponseContentType: opts.contentType,
      ResponseCacheControl: "private, no-store",
    }),
    { expiresIn: DOWNLOAD_URL_TTL },
  );
}

export async function headObject(key: string): Promise<{ size: number } | null> {
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: r.ContentLength ?? 0 };
  } catch (e) {
    if (e instanceof NotFound || (e as { name?: string }).name === "NotFound") return null;
    throw e;
  }
}

/** Lee los primeros bytes del objeto para identificar su tipo real. */
export async function readFirstBytes(key: string, n = 16): Promise<Uint8Array> {
  const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${n - 1}` }));
  return r.Body ? await r.Body.transformToByteArray() : new Uint8Array();
}

export async function copyObject(from: string, to: string): Promise<void> {
  await s3().send(new CopyObjectCommand({ Bucket: bucket(), CopySource: `${bucket()}/${from}`, Key: to }));
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
