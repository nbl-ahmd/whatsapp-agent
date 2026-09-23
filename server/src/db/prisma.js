import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const globalForPrisma = globalThis;

/**
 * Lazily create the Prisma client. Prisma 7 requires an explicit driver
 * adapter for direct database connections.
 */
export function getPrisma() {
  if (globalForPrisma.__prisma) return globalForPrisma.__prisma;

  if (!env.databaseUrl) {
    throw new Error(
      "DATABASE_URL is not configured. Copy .env.example to .env and set it.",
    );
  }

  const adapter = new PrismaPg({ connectionString: env.databaseUrl });
  const client = new PrismaClient({ adapter });

  globalForPrisma.__prisma = client;
  return client;
}

/**
 * Proxy that initializes the client on first property access, so importing this
 * module never connects to the database or throws at build time.
 */
export const prisma = new Proxy(
  {},
  {
    get(_target, property) {
      const client = getPrisma();
      const value = client[property];
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);

/** Prisma unique-constraint violation (P2002). Used for idempotent inserts. */
export function isUniqueConstraintError(error) {
  return Boolean(error && error.code === "P2002");
}
