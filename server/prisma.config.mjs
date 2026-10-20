import { defineConfig } from "prisma/config";

for (const file of [".env", "../.env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Environment variables may be injected by the deployment platform.
  }
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