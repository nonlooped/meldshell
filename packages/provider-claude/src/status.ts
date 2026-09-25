import type { Query } from "@anthropic-ai/claude-agent-sdk"
import { errorMessage, type ClaudeStatus } from "@meldshell/contracts"
import type { ClaudeCommand } from "./discovery"

type AccountInfo = Awaited<ReturnType<Query["accountInfo"]>>

export const claudeStatus = (
  discovered: ClaudeCommand | null,
  availability: ClaudeStatus["availability"],
  detail: string,
  accountEmail: string | null = null,
): ClaudeStatus => ({
  provider: "anthropic",
  harness: "claude-code",
  availability,
  detail,
  executablePath: discovered?.executablePath ?? null,
  version: discovered?.version ?? null,
  accountEmail,
  checkedAt: new Date().toISOString(),
})

/** Discovery failures that mean no usable Claude Code install was found. */
export const missingInstall = (cause: unknown): boolean =>
  /not installed|override could not be resolved/i.test(errorMessage(cause))

export const discoveryStatus = (discovered: ClaudeCommand | null, cause: unknown): ClaudeStatus => {
  const message = errorMessage(cause)
  if (/not installed|not available on PATH/i.test(message))
    return claudeStatus(discovered, "missing", message)
  if (/override could not be resolved/i.test(message))
    return claudeStatus(discovered, "error", message)
  return claudeStatus(discovered, "error", `Could not connect to Claude Code: ${message}`)
}

const isAuthenticated = (account: AccountInfo): boolean =>
  Boolean(
    account.email ||
      (account.tokenSource && account.tokenSource !== "none") ||
      (account.apiKeySource && account.apiKeySource !== "none") ||
      (account.apiProvider && account.apiProvider !== "firstParty"),
  )

export const accountStatus = (discovered: ClaudeCommand | null, account: AccountInfo) =>
  isAuthenticated(account)
    ? claudeStatus(discovered, "ready", "Claude Code is ready.", account.email ?? null)
    : claudeStatus(
        discovered,
        "unauthenticated",
        "Sign in with claude auth login in a terminal, then check again. You can also configure an Anthropic API key.",
        account.email ?? null,
      )
