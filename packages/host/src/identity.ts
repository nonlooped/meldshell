import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises"
import { hostname } from "node:os"
import { join } from "node:path"

export interface DeviceCredential {
  deviceId: string
  credential: string
  controlURL: string
  siteURL: string
  /** The name the account lists this computer under. Credentials from older links lack it. */
  deviceName?: string
  account: { id: string; email: string; name: string }
}
const credentialPath = (directory: string) => join(directory, "remote-credential.json")

function controlURL(value: string) {
  const url = new URL(value)
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  )
    throw new Error("Use HTTPS for the account service, or HTTP on localhost for development.")
  return url.origin
}
async function identity(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const path = join(directory, "device-id")
  await writeFile(path, randomUUID(), { flag: "wx", mode: 0o600 }).catch((cause) => {
    if (cause.code !== "EEXIST") throw cause
  })
  return (await readFile(path, "utf8")).trim()
}
export async function readCredential(directory: string): Promise<DeviceCredential | null> {
  try {
    return JSON.parse(await readFile(credentialPath(directory), "utf8"))
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null
    throw cause
  }
}
export const unlinkDevice = (directory: string) =>
  unlink(credentialPath(directory)).catch((cause) => {
    if (cause.code !== "ENOENT") throw cause
  })

const request = async (
  base: string,
  path: string,
  body?: unknown,
  token?: string,
  signal?: AbortSignal,
) => {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
    redirect: "error",
  })
  return { ok: response.ok, data: await response.json() }
}

/** Exchanges a short-lived account session for a revocable device credential. */
async function registerDevice(directory: string, base: string, siteURL: string, token: string) {
  try {
    const session = await request(base, "/api/auth/get-session", undefined, token)
    const user = session.data?.user
    if (!session.ok || typeof user?.id !== "string") throw new Error("Could not read your account.")
    // Each account gets a stable device identity, allowing sign-out and account switching.
    const hash = createHash("sha256")
      .update(`${await identity(directory)}:${user.id}`)
      .digest("hex")
    const deviceId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
    const name = hostname()
    const registration = await request(base, "/api/remote/v1/devices", { deviceId, name }, token)
    if (!registration.ok || typeof registration.data.credential !== "string")
      throw new Error("Device registration failed. Try signing in again.")
    const credential: DeviceCredential = {
      deviceId,
      credential: registration.data.credential,
      controlURL: base,
      siteURL,
      // The account keeps a name chosen on the devices page across re-links.
      deviceName:
        typeof registration.data.name === "string" && registration.data.name
          ? registration.data.name
          : name,
      account: { id: user.id, email: user.email, name: user.name },
    }
    const temporary = `${credentialPath(directory)}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(credential), { mode: 0o600 })
    await rename(temporary, credentialPath(directory))
  } finally {
    await request(base, "/api/auth/sign-out", {}, token).catch(() => undefined)
  }
}

export class LinkCancelled extends Error {
  constructor() {
    super("Sign-in was cancelled.")
    this.name = "LinkCancelled"
  }
}

/**
 * Starts the OAuth device flow; `complete` settles once the browser approves the code, and
 * `cancel` abandons it so a new sign-in can start at once.
 */
export async function beginLink(directory: string, value: string) {
  const base = controlURL(value)
  const client = { client_id: "meldshell-host" }
  const issued = await request(base, "/api/auth/device/code", client)
  if (!issued.ok || !issued.data.device_code) throw new Error("Could not start device sign-in.")
  const verificationURL = String(
    issued.data.verification_uri_complete ?? issued.data.verification_uri,
  )
  const controller = new AbortController()
  const { signal } = controller
  const wait = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort)
        resolve()
      }, ms)
      const abort = () => {
        clearTimeout(timer)
        reject(new LinkCancelled())
      }
      signal.addEventListener("abort", abort, { once: true })
    })
  /** One poll of the token endpoint: keep waiting, wait longer, or the token to register with. */
  const poll = async (): Promise<"pending" | "slow_down" | string> => {
    let response: Awaited<ReturnType<typeof request>>
    try {
      response = await request(
        base,
        "/api/auth/device/token",
        {
          ...client,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: issued.data.device_code,
        },
        undefined,
        signal,
      )
    } catch (cause) {
      throw signal.aborted ? new LinkCancelled() : cause
    }
    if (response.data.error === "authorization_pending") return "pending"
    if (response.data.error === "slow_down") return "slow_down"
    if (!response.ok || typeof response.data.access_token !== "string")
      throw new Error("Device authorization expired or was denied.")
    return response.data.access_token
  }
  const complete = (async () => {
    let interval = Math.max(5, issued.data.interval ?? 5)
    const expires = Date.now() + Math.min(900, issued.data.expires_in ?? 600) * 1000
    while (Date.now() < expires) {
      await wait(interval * 1000)
      const outcome = await poll()
      if (outcome === "pending") continue
      if (outcome === "slow_down") {
        interval += 5
        continue
      }
      return registerDevice(directory, base, controlURL(new URL(verificationURL).origin), outcome)
    }
    throw new Error("Device authorization expired. Start sign-in again.")
  })()
  // Callers display the code before awaiting completion; avoid an unhandled rejection meanwhile.
  complete.catch(() => undefined)
  return {
    userCode: String(issued.data.user_code),
    verificationURL,
    complete,
    cancel: () => controller.abort(),
  }
}
