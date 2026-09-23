import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import type { Accounts } from "./auth"

type DeviceRow = {
  id: string
  account_id: string
  name: string
  key_id: string
  last_seen: number | null
  revoked_at: number | null
}

export class Devices {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(
    private readonly db: DatabaseSync,
    private readonly auth: Accounts,
    private readonly now = Date.now,
  ) {
    db.exec(`CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      name TEXT NOT NULL, key_id TEXT NOT NULL, last_seen INTEGER, revoked_at INTEGER
    ); CREATE INDEX IF NOT EXISTS devices_account ON devices(account_id)`)
    const columns = db.prepare("PRAGMA table_info(devices)").all()
    if (columns.some((column) => column.name === "credential_hash")) this.migrateCredentials()
  }
  private migrateCredentials() {
    this.db.exec("BEGIN IMMEDIATE")
    try {
      this.db.exec("ALTER TABLE devices ADD COLUMN key_id TEXT")
      for (const row of this.db.prepare("SELECT * FROM devices").all()) {
        const keyId = randomUUID()
        // Better Auth's default hasher is SHA-256 encoded as unpadded base64url.
        this.db
          .prepare(`INSERT INTO apikey
          (id, configId, referenceId, name, key, enabled, rateLimitEnabled, requestCount, createdAt, updatedAt)
          VALUES (?, 'device', ?, ?, ?, ?, 0, 0, ?, ?)`)
          .run(
            keyId,
            row.account_id!,
            row.name!,
            Buffer.from(row.credential_hash as Uint8Array).toString("base64url"),
            row.revoked_at === null ? 1 : 0,
            this.now(),
            this.now(),
          )
        this.db.prepare("UPDATE devices SET key_id = ? WHERE id = ?").run(keyId, row.id!)
      }
      this.db.exec("ALTER TABLE devices DROP COLUMN credential_hash; COMMIT")
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
  }
  private serialize<A>(work: () => Promise<A>): Promise<A> {
    const result = this.queue.then(work)
    this.queue = result.catch(() => undefined)
    return result
  }
  register(accountId: string, id: string, name: string) {
    return this.serialize(async () => {
      const existing = this.get(id)
      if (existing && existing.account_id !== accountId)
        throw new Error("Device belongs to another account.")
      const key = await this.auth.api.createApiKey({
        body: { configId: "device", userId: accountId, name },
      })
      if (existing) await this.disable(existing)
      this.db
        .prepare(`INSERT INTO devices (id, account_id, name, key_id, last_seen, revoked_at)
        VALUES (?, ?, ?, ?, NULL, NULL)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, key_id = excluded.key_id, revoked_at = NULL`)
        .run(id, accountId, name, key.id)
      return { deviceId: id, credential: key.key }
    })
  }
  private disable(row: DeviceRow) {
    return this.auth.api.updateApiKey({
      body: { configId: "device", keyId: row.key_id, userId: row.account_id, enabled: false },
    })
  }
  get(id: string) {
    return this.db.prepare("SELECT * FROM devices WHERE id = ?").get(id) as DeviceRow | undefined
  }
  authorize(accountId: string, deviceId: string) {
    const row = this.get(deviceId)
    return row?.account_id === accountId && row.revoked_at === null
  }
  /** Returns the owning account for a valid, unrevoked device credential. */
  async authenticate(deviceId: string, credential: string) {
    const row = this.get(deviceId)
    if (!row || row.revoked_at !== null) return null
    const result = await this.auth.api.verifyApiKey({
      body: { configId: "device", key: credential },
    })
    // Re-read after verification so rotation/revocation cannot admit an old key.
    const current = this.get(deviceId)
    return result.valid &&
      result.key?.id === current?.key_id &&
      current?.revoked_at === null &&
      result.key?.referenceId === current.account_id
      ? current.account_id
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
    return this.serialize(async () => {
      const row = this.get(deviceId)
      if (!row || row.account_id !== accountId || row.revoked_at !== null) return false
      await this.disable(row)
      this.db.prepare("UPDATE devices SET revoked_at = ? WHERE id = ?").run(this.now(), deviceId)
      return true
    })
  }
}
