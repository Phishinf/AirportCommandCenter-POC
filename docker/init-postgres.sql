-- Nexus Aviation Suite — PostgreSQL initialisation
-- Runs once on first container start (docker-entrypoint-initdb.d)
-- Fixes PostgreSQL 15+ default privilege changes on the public schema

-- Grant full access on the database
GRANT ALL PRIVILEGES ON DATABASE nexus TO nexus;

-- Grant schema-level privileges (required in PostgreSQL 15+)
GRANT ALL ON SCHEMA public TO nexus;
ALTER SCHEMA public OWNER TO nexus;

-- Ensure future tables/sequences are accessible
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO nexus;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO nexus;
