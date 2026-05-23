import { drizzle } from "drizzle-orm/neon-http";

export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL);

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://crosstube:crosstube@localhost:5432/crosstube";

export const db = drizzle(databaseUrl);
