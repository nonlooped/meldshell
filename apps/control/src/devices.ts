import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

const digest = (value: string) => createHash("sha256").update(value).digest()
type DeviceRow = {
  id: string
  account_id: string
  name: string
  credential_hash: Uint8Array
  last_seen: number | null
  revoked_at: number | null
}

export class Devices {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now = Date.now,
  ) {
    db.exec(`CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      name TEXT NOT NULL, credential_hash BLOB NOT NULL, last_seen INTEGER, revoked_at INTEGER
    ); CREATE INDEX IF NOT EXISTS devices_account ON devices(account_id)`)
  }
  register(accountId: string, id: string, name: string) {
    const existing = this.get(id)
    if (existing && existing.account_id !== accountId)
      throw new Error("Device belongs to another account.")
    const credential = randomBytes(32).toString("base64url")
    this.db
      .prepare(`INSERT INTO devices VALUES (?, ?, ?, ?, NULL, NULL)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, credential_hash = excluded.credential_hash,
      revoked_at = NULL`)
      .run(id, accountId, name, digest(credential))
    return { deviceId: id, credential }
  }
  get(id: string) {
    return this.db.prepare("SELECT * FROM devices WHERE id = ?").get(id) as DeviceRow | undefined
  }
  authorize(accountId: string, deviceId: string) {
    const row = this.get(deviceId)
    return row?.account_id === accountId && row.revoked_at === null
  }
  /** Returns the owning account for a valid, unrevoked device credential. */
  authenticate(deviceId: string, credential: string) {
    const row = this.get(deviceId)
    return row &&
      row.revoked_at === null &&
      timingSafeEqual(row.credential_hash, digest(credential))
      ? row.account_id
      : null
  }
  seen(deviceId: string) {
    this.db.prepare("UPDATE devices SET last_seen = ? WHERE id = ?").run(this.now(), deviceId)
  }
  list(accountId: string, online: (deviceId: string) => boolean) {
    const rows = this.db
      .prepare(
        "SELECT * FROM devices WHERE account_id = ? AND revoked_at IS NULL ORDER BY name, id",
      )
      .all(accountId) as DeviceRow[]
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      lastSeen: row.last_seen,
      online: online(row.id),
    }))
  }
  revoke(accountId: string, deviceId: string) {
    return (
      this.db
        .prepare(
          "UPDATE devices SET revoked_at = ? WHERE id = ? AND account_id = ? AND revoked_at IS NULL",
        )
        .run(this.now(), deviceId, accountId).changes > 0
    )
  }
}
