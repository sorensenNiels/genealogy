import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Inside the dev container it comes from docker-compose.yml.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  // Apache AGE keeps its own catalogue and one schema per graph. Drizzle must
  // never introspect or try to drop those, or `generate` will emit migrations
  // that dismantle the graph.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});
