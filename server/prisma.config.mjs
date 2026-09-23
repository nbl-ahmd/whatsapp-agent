import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile();
} catch {
  // Environment variables may be injected by the deployment platform.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.mjs",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});