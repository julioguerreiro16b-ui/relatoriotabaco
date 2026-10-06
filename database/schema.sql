-- Run as the database owner. The application uses a private server-side PostgreSQL connection.
BEGIN;
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
-- Supabase Data API clients must not access workspace state or original documents.
-- No client-facing policies are created. The backend database owner bypasses RLS.
ALTER TABLE hf_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE hf_documents ENABLE ROW LEVEL SECURITY;
COMMIT;
-- Initial state is inserted idempotently by src/server/store.ts.
