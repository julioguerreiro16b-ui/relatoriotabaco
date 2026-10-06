-- Shared workspace state. Apply using a migration account when runtime DDL is restricted.
CREATE TABLE IF NOT EXISTS hf_state (
  id integer PRIMARY KEY CHECK (id = 1),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hf_documents (
  id uuid PRIMARY KEY,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Initial state is inserted idempotently by src/server/store.ts.
-- PostgreSQL credentials remain server-only. Do not expose these tables to public clients.
