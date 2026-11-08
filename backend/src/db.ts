import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { env } from "./env";

let client: PrismaClient | undefined;

/** Fuerza TLS con verificación completa del certificado, venga como venga la URL. */
export function withVerifiedTls(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

export function db(): PrismaClient {
  client ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: withVerifiedTls(env().DATABASE_URL) }),
  });
  return client;
}
