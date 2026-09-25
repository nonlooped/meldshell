import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { Schema } from "effect"
import { jwtDecode } from "jwt-decode"

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
  try {
    const { email } = jwtDecode<{ readonly email?: unknown }>(idToken)
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
