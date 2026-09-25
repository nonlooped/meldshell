import { lookup } from "node:dns/promises"
import { get as getHttp } from "node:http"
import { get as getHttps } from "node:https"
import { isIP } from "node:net"
import { Address4, Address6 } from "ip-address"
import { Parser } from "htmlparser2"
import { LRUCache } from "lru-cache"
import pLimit from "p-limit"

// Only literal host addresses reach this policy; DNS answers and every redirect use it.
export function publicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return new Address4(address).isGlobal()
  if (family === 6) return new Address6(address).isGlobal()
  return false
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

/** Page titles fetched in the last hour; a failed fetch is remembered as having no title. */
const titles = new LRUCache<string, Promise<string | null>>({ max: 256, ttl: 60 * 60 * 1000 })
const requests = pLimit(4)

/** How many title requests may wait for a free slot before new ones are refused. */
const MAX_WAITING = 64

const fetchTitle = (url: URL): Promise<string | null> =>
  requests(() => requestTitle(url, AbortSignal.timeout(8000))).catch(() => null)

export function getWebPageTitle(value: string): Promise<string | null> {
  const url = pageUrl(value)
  if (!url) return Promise.resolve(null)
  const cached = titles.get(url.href)
  if (cached) return cached
  if (requests.pendingCount >= MAX_WAITING) return Promise.resolve(null)
  const result = fetchTitle(url)
  titles.set(url.href, result)
  return result
}
