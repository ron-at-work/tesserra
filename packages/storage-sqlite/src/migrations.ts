import { createHash } from 'node:crypto';

export interface Migration {
  readonly id: string;
  readonly sql: string;
  readonly checksum: string;
}
const migration = (id: string, sql: string): Migration => ({
  id,
  sql,
  checksum: createHash('sha256').update(sql, 'utf8').digest('hex')
});

export const migrations: readonly Migration[] = [
  migration(
    '0001_identity_trust_events',
    `
CREATE TABLE agents (
  id TEXT PRIMARY KEY NOT NULL,
  principal_type TEXT NOT NULL CHECK (principal_type = 'agent'),
  display_name TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;
CREATE TABLE keys (
  id TEXT PRIMARY KEY NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  algorithm TEXT NOT NULL CHECK (algorithm = 'Ed25519'),
  public_jwk_json TEXT NOT NULL,
  provider_reference TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'retired', 'compromised', 'revoked')),
  not_before TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  replacement_key_id TEXT REFERENCES keys(id),
  history_sequence INTEGER NOT NULL CHECK (history_sequence >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (not_before <= expires_at),
  UNIQUE (agent_id, history_sequence)
) STRICT;
CREATE TABLE trust_snapshots (
  snapshot_id TEXT PRIMARY KEY NOT NULL,
  policy_hash TEXT NOT NULL,
  sequence INTEGER NOT NULL UNIQUE CHECK (sequence >= 0),
  canonical_policy BLOB NOT NULL,
  issuer_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL,
  CHECK (issued_at <= expires_at)
) STRICT;
CREATE TABLE trust_anchors (
  snapshot_id TEXT NOT NULL REFERENCES trust_snapshots(snapshot_id) ON DELETE RESTRICT,
  anchor_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  public_jwk_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, anchor_id)
) STRICT;
CREATE TABLE status_publishers (
  snapshot_id TEXT NOT NULL REFERENCES trust_snapshots(snapshot_id) ON DELETE RESTRICT,
  publisher_id TEXT NOT NULL,
  target_key_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  digest TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, publisher_id, target_key_id)
) STRICT;
CREATE TABLE verification_events (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('verified', 'rejected')),
  primary_code TEXT NOT NULL,
  secondary_codes_json TEXT NOT NULL,
  artifact_digest TEXT,
  evidence_ids_json TEXT NOT NULL,
  trust_snapshot_id TEXT REFERENCES trust_snapshots(snapshot_id),
  policy_hash TEXT,
  trust_sequence INTEGER,
  status_hash TEXT,
  redacted_evidence_json TEXT
) STRICT;
CREATE INDEX verification_events_occurred_at ON verification_events (occurred_at DESC, id DESC);
CREATE INDEX verification_events_snapshot ON verification_events (trust_snapshot_id, occurred_at DESC, id DESC);
CREATE TABLE replay_requests (
  audience TEXT NOT NULL,
  signer_key_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  nonce_digest TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT NOT NULL,
  PRIMARY KEY (audience, signer_key_id, request_id),
  UNIQUE (audience, signer_key_id, nonce_digest)
) STRICT;
CREATE INDEX replay_requests_expiry ON replay_requests (expires_at);
`
  ),
  migration(
    '0002_identity_credentials',
    `
CREATE TABLE identity_credentials (
  id TEXT PRIMARY KEY NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  credential_json TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX identity_credentials_agent ON identity_credentials (agent_id, id);
CREATE TABLE identity_idempotency (
  key TEXT PRIMARY KEY NOT NULL,
  identity_id TEXT NOT NULL REFERENCES identity_credentials(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
) STRICT;
`
  ),
  migration(
    '0003_key_history',
    `
CREATE TABLE key_history (
  key_id TEXT NOT NULL REFERENCES keys(id) ON DELETE RESTRICT,
  history_sequence INTEGER NOT NULL CHECK (history_sequence >= 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'retired', 'compromised', 'revoked')),
  not_before TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  replacement_key_id TEXT,
  provider_reference TEXT,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (key_id, history_sequence),
  CHECK (not_before <= expires_at)
) STRICT;
CREATE INDEX key_history_recorded_at ON key_history (recorded_at DESC);
`
  )
];
