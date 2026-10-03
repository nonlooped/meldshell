/*
 * The desktop app lets agents drive a thread's browser preview over MCP. It hands provider workers
 * the server's private address in `MELDSHELL_BROWSER_MCP`; each worker takes it out of its
 * environment at once so agent commands and terminals never inherit it. Without a desktop (WSL,
 * headless hosts) the variable is absent and agents get no browser tools.
 */
const base = process.env.MELDSHELL_BROWSER_MCP
delete process.env.MELDSHELL_BROWSER_MCP

/** The MCP server name agents see the browser tools under. */
export const BROWSER_SERVER = "meldshell-browser"

/** The address of a thread's browser tools, or null when this host has no desktop browser. */
export const browserUrl = (threadId: string): string | null =>
  base ? `${base}/${encodeURIComponent(threadId)}` : null
