import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { env } from "./env";

let client: PrismaClient | undefined;

export function db(): PrismaClient {
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: env().DATABASE_URL }) });
  return client;
}
