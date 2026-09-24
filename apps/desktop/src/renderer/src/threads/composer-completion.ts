import type { ComposerCommand, InputAttachment } from "@meldshell/contracts"

type CompletionKind = "path" | "command" | "skill"

export interface CompletionTrigger {
  /** `@` completes workspace paths, `$` skills, and `/` at the start of a message commands. */
  readonly kind: CompletionKind
  /** The token being completed spans `start` (its sigil) to `end` in the draft. */
  readonly start: number
  readonly end: number
  readonly query: string
}

const isSpace = (character: string | undefined): boolean =>
  character !== undefined && /\s/.test(character)

export function completionTrigger(text: string, caret: number): CompletionTrigger | null {
  let start = caret
  while (start > 0 && !isSpace(text[start - 1])) start -= 1
  let end = caret
  while (end < text.length && !isSpace(text[end])) end += 1
  const token = text.slice(start, caret)
  if (token.startsWith("@"))
    return { kind: "path", start, end, query: token.slice(1).replace(/^"/, "") }
  if (token.startsWith("$")) return { kind: "skill", start, end, query: token.slice(1) }
  if (token.startsWith("/") && text.slice(0, start).trim() === "" && !token.includes("/", 1))
    return { kind: "command", start, end, query: token.slice(1) }
  return null
}

/** An accepted completion, shown as a pill wherever its exact text stands alone in the draft. */
export interface ComposerToken {
  readonly kind: CompletionKind
  /** The text in the draft, including its sigil, such as `@src/main.ts`, `/review`, or `$pdf`. */
  readonly text: string
  /** For skills: a SKILL.md path, or the name when the harness resolves skills itself. */
  readonly skill?: string
}

export interface TokenRange {
  readonly start: number
  readonly end: number
  readonly token: ComposerToken
}

export function tokenRanges(text: string, tokens: readonly ComposerToken[]): TokenRange[] {
  const ranges: TokenRange[] = []
  for (const token of tokens) {
    for (
      let start = text.indexOf(token.text);
      start !== -1;
      start = text.indexOf(token.text, start + 1)
    ) {
      const end = start + token.text.length
      if (start > 0 && !isSpace(text[start - 1])) continue
      if (end < text.length && !isSpace(text[end])) continue
      // Harnesses only run a command that opens the message.
      if (token.kind === "command" && text.slice(0, start).trim() !== "") continue
      ranges.push({ start, end, token })
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end)
  return ranges.filter((range, index) => index === 0 || range.start >= ranges[index - 1]!.end)
}

/** Skill pills become skill inputs for the turn; the `$name` text stays in the prompt. */
export function skillAttachments(
  text: string,
  tokens: readonly ComposerToken[],
): InputAttachment[] {
  const seen = new Set<string>()
  return tokenRanges(text, tokens).flatMap(({ token }) => {
    if (token.kind !== "skill" || token.skill === undefined || seen.has(token.skill)) return []
    seen.add(token.skill)
    return [{ type: "skill" as const, value: token.skill, name: token.text.slice(1) }]
  })
}

/** Replaces the trigger token and returns where the caret belongs afterwards. */
export function applyCompletion(
  text: string,
  trigger: CompletionTrigger,
  replacement: string,
): { readonly text: string; readonly caret: number } {
  const after = text.slice(trigger.end)
  // A trailing space closes the token; reuse existing whitespace instead of doubling it.
  const inserted =
    replacement.endsWith(" ") && isSpace(after[0]) ? replacement.slice(0, -1) : replacement
  return {
    text: text.slice(0, trigger.start) + inserted + after,
    caret: trigger.start + replacement.length,
  }
}

export const pathMention = (path: string): string => (/\s/.test(path) ? `@"${path}"` : `@${path}`)

export function filterCommands(
  commands: readonly ComposerCommand[],
  query: string,
  limit = 50,
): ComposerCommand[] {
  const lowered = query.toLowerCase()
  const rank = (command: ComposerCommand): number => {
    const name = command.name.toLowerCase()
    if (name === lowered) return 0
    if (name.startsWith(lowered)) return 1
    // Plugin commands are namespaced, as in `plugin:command`.
    if (name.split(":").some((part) => part.startsWith(lowered))) return 2
    if (name.includes(lowered)) return 3
    if (command.description.toLowerCase().includes(lowered)) return 4
    return -1
  }
  return commands
    .map((command) => ({ command, rank: rank(command) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.command.name.localeCompare(b.command.name))
    .slice(0, limit)
    .map((entry) => entry.command)
}
