import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { Schema } from "effect"

const Auth = Schema.Struct({
  tokens: Schema.optional(
    Schema.NullOr(Schema.Struct({ id_token: Schema.optional(Schema.NullOr(Schema.String)) })),
  ),
})

/**
 * Reads only the email claim of the stored ChatGPT identity token. The token is never verified
 * here: Codex owns the session, and this value is display-only.
 */
function emailFromIdToken(idToken: string | null | undefined): string | null {
  if (!idToken) return null
  const payload = idToken.split(".")[1]
  if (!payload || !/^[A-Za-z0-9_-]+$/.test(payload)) return null
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    const email = (claims as { email?: unknown }).email
    return typeof email === "string" && email.includes("@") ? email : null
  } catch {
    return null
  }
}

function codexHome(): string {
  return process.env.CODEX_HOME ?? join(homedir(), ".codex")
}

/** Never throws or reports the file contents: a missing or unreadable login simply has no email. */
export async function readCodexAccountEmail(home = codexHome()): Promise<string | null> {
  try {
    const auth = Schema.decodeUnknownSync(Auth)(
      JSON.parse(await readFile(join(home, "auth.json"), "utf8")),
    )
    return emailFromIdToken(auth.tokens?.id_token)
  } catch {
    return null
  }
}
