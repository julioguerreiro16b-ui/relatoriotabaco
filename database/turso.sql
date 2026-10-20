-- Turso / libSQL. hf_state.data contains gzip-compressed UTF-8 JSON.
-- Private access through the application's server-side database token.
CREATE TABLE IF NOT EXISTS hf_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS hf_documents (
  id TEXT PRIMARY KEY,
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- The migration inserts the state only after verifying every document.
