-- Runs once, on first initialisation of the Postgres data volume.
-- Everything here must be idempotent: a rebuilt container with a retained
-- volume skips this file entirely, but a manual re-run must not fail.

CREATE EXTENSION IF NOT EXISTS age;
CREATE EXTENSION IF NOT EXISTS postgis;

LOAD 'age';
SET search_path = ag_catalog, "$user", public;

-- The single graph that holds genealogical relationships (Person nodes,
-- PARENT_OF / SPOUSE_OF edges). Relational data lives in ordinary tables.
--
-- Named `family_tree`, not `genealogy`: create_graph() makes a schema of the
-- same name, and the database and role are both called `genealogy`. A graph
-- called `genealogy` would therefore create a `genealogy` schema that the
-- default `"$user"` search path resolves to ahead of `public`, quietly
-- diverting every CREATE TABLE into AGE's graph schema.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ag_catalog.ag_graph WHERE name = 'family_tree') THEN
    PERFORM ag_catalog.create_graph('family_tree');
  END IF;
END
$$;

-- `public` first, and no `"$user"` at all. CREATE TABLE resolves against the
-- first schema on the path, so the ordering AGE's own docs suggest
-- (`ag_catalog, "$user", public`) silently creates Drizzle's tables inside a
-- graph or catalogue schema, and the migration then fails on the first foreign
-- key that names public. This default covers drizzle-kit and psql; the
-- application pool sets the same path itself (see packages/db/src/age.ts).
ALTER DATABASE genealogy SET search_path = public, ag_catalog;
