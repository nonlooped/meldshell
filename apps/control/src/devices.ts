import { accounts, type Env } from "./auth"

export type DeviceRow = {
  id: string
  accountId: string
  name: string
  keyId: string
  online: number
  lastSeen: number | null
  revokedAt: number | null
  /** Set once the account named the device itself; re-registration then keeps that name. */
  renamedAt: number | null
}

export const getDevice = (db: D1Database, id: string) =>
  db.prepare('SELECT * FROM "device" WHERE id = ?').bind(id).first<DeviceRow>()

export async function listDevices(db: D1Database, accountId: string) {
  const { results } = await db
    .prepare('SELECT * FROM "device" WHERE accountId = ? AND revokedAt IS NULL ORDER BY name, id')
    .bind(accountId)
    .all<DeviceRow>()
  return results.map((row) => ({
    id: row.id,
    name: row.name,
    lastSeen: row.lastSeen,
    online: row.online === 1,
  }))
}

/** Records relay presence; the relay owns `online`, so a revoked or reassigned row is left alone. */
export const setPresence = (db: D1Database, id: string, online: boolean, now = Date.now()) =>
  db
    .prepare('UPDATE "device" SET online = ?, lastSeen = ? WHERE id = ?')
    .bind(online ? 1 : 0, now, id)
    .run()

const disableKey = (env: Env, row: DeviceRow) =>
  accounts(env).api.updateApiKey({
    body: { configId: "device", keyId: row.keyId, userId: row.accountId, enabled: false },
  })

/**
 * Issues a new credential for a device, disabling any previous one. Callers serialize per account.
 * A name chosen on the devices page outlives re-registration; the host's hostname fills in
 * otherwise. The name in force is returned so the host can show it.
 */
export async function registerDevice(env: Env, accountId: string, id: string, name: string) {
  const existing = await getDevice(env.DB, id)
  if (existing && existing.accountId !== accountId)
    throw new Error("Device belongs to another account.")
  const finalName = existing !== null && existing.renamedAt !== null ? existing.name : name
  const key = await accounts(env).api.createApiKey({
    body: { configId: "device", userId: accountId, name: finalName },
  })
  if (existing) await disableKey(env, existing)
  await env.DB.prepare(
    `INSERT INTO "device" (id, accountId, name, keyId, online, lastSeen, revokedAt, renamedAt)
     VALUES (?, ?, ?, ?, 0, NULL, NULL, NULL)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, keyId = excluded.keyId, revokedAt = NULL`,
  )
    .bind(id, accountId, finalName, key.id)
    .run()
  return { deviceId: id, credential: key.key, name: finalName }
}

/** Names a device for its account; returns false when the account has no such live device. */
export async function renameDevice(
  env: Env,
  accountId: string,
  id: string,
  name: string,
  now = Date.now(),
) {
  const result = await env.DB.prepare(
    'UPDATE "device" SET name = ?, renamedAt = ? WHERE id = ? AND accountId = ? AND revokedAt IS NULL',
  )
    .bind(name, now, id, accountId)
    .run()
  return (result.meta.changes ?? 0) > 0
}

export async function revokeDevice(env: Env, accountId: string, id: string, now = Date.now()) {
  const row = await getDevice(env.DB, id)
  if (!row || row.accountId !== accountId || row.revokedAt !== null) return false
  await disableKey(env, row)
  await env.DB.prepare('UPDATE "device" SET revokedAt = ?, online = 0 WHERE id = ?')
    .bind(now, id)
    .run()
  return true
}

/** Returns the device row for a valid credential bound to it, or null. */
export async function authenticateDevice(env: Env, id: string, credential: string) {
  if (!credential) return null
  const row = await getDevice(env.DB, id)
  if (!row || row.revokedAt !== null) return null
  const result = await accounts(env).api.verifyApiKey({
    body: { configId: "device", key: credential },
  })
  // Re-read after verification so rotation or revocation cannot admit an old key.
  const current = await getDevice(env.DB, id)
  return result.valid &&
    current &&
    result.key?.id === current.keyId &&
    current.revokedAt === null &&
    result.key?.referenceId === current.accountId
    ? current
    : null
}
