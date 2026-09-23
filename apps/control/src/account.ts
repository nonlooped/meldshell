import { DurableObject } from "cloudflare:workers"
import type { Env } from "./auth"
import { listDevices, registerDevice, revokeDevice } from "./devices"

/**
 * @public Bound as a Durable Object in wrangler.jsonc.
 *
 * One per account. Serializes credential rotation and revocation for the account's devices, then
 * closes the affected relay connections, so a concurrent link or removal cannot leave two live
 * keys or an open socket behind.
 */
export class Account extends DurableObject<Env> {
  private queue: Promise<unknown> = Promise.resolve()

  private serialize<A>(work: () => Promise<A>): Promise<A> {
    const result = this.queue.then(work)
    this.queue = result.catch(() => undefined)
    return result
  }

  private relay(deviceId: string) {
    return this.env.DEVICES.getByName(deviceId)
  }

  register(accountId: string, deviceId: string, name: string) {
    return this.serialize(async () => {
      const registered = await registerDevice(this.env, accountId, deviceId, name)
      await this.relay(deviceId).disconnect()
      return registered
    })
  }

  revoke(accountId: string, deviceId: string) {
    return this.serialize(async () => {
      if (!(await revokeDevice(this.env, accountId, deviceId))) return false
      await this.relay(deviceId).disconnect()
      return true
    })
  }

  /** Ends relay access for a browser session as soon as it signs out. */
  async endSession(accountId: string, sessionId: string) {
    const devices = await listDevices(this.env.DB, accountId)
    // Browsers can only be connected to an online host.
    await Promise.all(
      devices
        .filter((device) => device.online)
        .map((device) => this.relay(device.id).endSession(sessionId)),
    )
  }
}
