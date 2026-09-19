import { lookup } from "node:dns/promises"
import { get as getHttp } from "node:http"
import { get as getHttps } from "node:https"
import { BlockList, isIP } from "node:net"
import { Parser } from "htmlparser2"

const blocked = new BlockList()
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(address, prefix, "ipv4")
for (const [address, prefix] of [
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const)
  blocked.addSubnet(address, prefix, "ipv6")

function publicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !blocked.check(address, "ipv6")
  return family === 4 && !blocked.check(address, "ipv4")
}

function pageUrl(value: string): URL | null {
  if (value.length > 8192) return null
  try {
    const url = new URL(value)
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return null
    url.hash = ""
    return url
  } catch {
    return null
  }
}

export function titleParser(onTitle: (title: string) => void): Parser {
  let inside = false
  let title = ""
  let found = false
  return new Parser(
    {
      onopentag(name) {
        if (name === "title" && !found) inside = true
      },
      ontext(text) {
        if (inside) title += text.slice(0, Math.max(0, 1024 - title.length))
      },
      onclosetag(name) {
        if (name !== "title" || !inside) return
        inside = false
        const clean = title.replace(/\s+/g, " ").trim()
        if (clean) {
          found = true
          onTitle(clean)
        }
      },
    },
    { decodeEntities: true },
  )
}

function redirectUrl(location: string | undefined, current: URL): URL | null {
  try {
    return location ? pageUrl(new URL(location, current).href) : null
  } catch {
    return null
  }
}

async function resolveHost(hostname: string, signal: AbortSignal) {
  let cancel: () => void
  const aborted = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(signal.reason)
    signal.addEventListener("abort", cancel, { once: true })
  })
  try {
    return await Promise.race([lookup(hostname, { all: true }), aborted])
  } finally {
    signal.removeEventListener("abort", cancel!)
  }
}

async function requestTitle(url: URL, signal: AbortSignal, redirects = 0): Promise<string | null> {
  signal.throwIfAborted()
  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = await resolveHost(hostname, signal)
  signal.throwIfAborted()
  if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address))) return null
  return new Promise((resolve, reject) => {
    const get = url.protocol === "https:" ? getHttps : getHttp
    const request = get(
      url,
      {
        signal,
        agent: false,
        // Pin the validated DNS result; redirects are independently validated below.
        lookup: (_host, options, callback) => {
          if (options.all) callback(null, addresses)
          else callback(null, addresses[0]!.address, addresses[0]!.family)
        },
        headers: { Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "identity" },
      },
      (response) => {
        const status = response.statusCode ?? 0
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.destroy()
          const next = redirectUrl(response.headers.location, url)
          resolve(next && redirects < 4 ? requestTitle(next, signal, redirects + 1) : null)
          return
        }
        if (
          status !== 200 ||
          !/^(?:text\/html|application\/xhtml\+xml)\b/i.test(response.headers["content-type"] ?? "")
        ) {
          response.destroy()
          resolve(null)
          return
        }
        let bytes = 0
        const parser = titleParser((title) => {
          resolve(title)
          response.destroy()
        })
        response.setEncoding("utf8")
        response.on("data", (chunk: string) => {
          bytes += Buffer.byteLength(chunk)
          if (bytes > 512 * 1024) {
            response.destroy()
            resolve(null)
            return
          }
          parser.write(chunk)
        })
        response.on("end", () => {
          parser.end()
          resolve(null)
        })
        response.on("error", reject)
      },
    )
    request.on("error", reject)
  })
}

const cache = new Map<string, { expires: number; result: Promise<string | null> }>()
let active = 0
const waiting: (() => void)[] = []

async function fetchTitle(url: URL): Promise<string | null> {
  if (active >= 4) await new Promise<void>((resolve) => waiting.push(resolve))
  else active++
  try {
    return await requestTitle(url, AbortSignal.timeout(8000))
  } catch {
    return null
  } finally {
    const next = waiting.shift()
    if (next) next()
    else active--
  }
}

export function getWebPageTitle(value: string): Promise<string | null> {
  const url = pageUrl(value)
  if (!url) return Promise.resolve(null)
  const existing = cache.get(url.href)
  if (existing && existing.expires > Date.now()) return existing.result
  if (waiting.length >= 64) return Promise.resolve(null)
  const result = fetchTitle(url)
  cache.delete(url.href)
  cache.set(url.href, { result, expires: Date.now() + 60 * 60 * 1000 })
  if (cache.size > 256) cache.delete(cache.keys().next().value!)
  return result
}
