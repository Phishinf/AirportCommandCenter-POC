-- Nexus Aviation Suite — PostgreSQL initialisation
-- Runs once on first container start via docker-entrypoint-initdb.d
-- Executed as the postgres superuser

-- Create the nexus app user
CREATE USER nexus WITH PASSWORD 'nexus_secret';

-- Grant database access
GRANT ALL PRIVILEGES ON DATABASE nexus TO nexus;

-- Fix PostgreSQL 15+ public schema privilege changes
GRANT ALL ON SCHEMA public TO nexus;
ALTER SCHEMA public OWNER TO nexus;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO nexus;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO nexus;
