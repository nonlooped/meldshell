import { asRecord, type ApprovalRequest, type CanonicalEvent } from "@meldshell/contracts"
import { createTwoFilesPatch, FILE_HEADERS_ONLY } from "diff"
import { fileChangePatches } from "./file-change-diffs"

/** One line of a tool call's input, as a label and its value in plain text. */
export interface ToolField {
  readonly label: string
  readonly value: string
  /** Code, paths and patterns read better in the monospace face. */
  readonly code: boolean
}

const LABELS: Readonly<Record<string, string>> = {
  file_path: "File",
  notebook_path: "Notebook",
  path: "Path",
  url: "URL",
  query: "Query",
  pattern: "Pattern",
  glob: "Files",
  prompt: "Prompt",
  description: "Description",
  command: "Command",
  cwd: "Folder",
}

/** Prose fields; everything else is code-like (paths, patterns, URLs, JSON). */
const PROSE = new Set(["prompt", "description", "reason", "title", "question"])

const fieldLabel = (key: string): string => {
  const known = LABELS[key]
  if (known !== undefined) return known
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const fieldValue = (value: unknown): string => {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  const compact = JSON.stringify(value)
  return compact.length <= 80 ? compact : JSON.stringify(value, null, 2)
}

/** A tool call's input as labelled lines, leaving out empty values. */
export const toolFields = (input: unknown): ToolField[] =>
  Object.entries(asRecord(input))
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({
      label: fieldLabel(key),
      value: fieldValue(value),
      code: !PROSE.has(key),
    }))

const headers = { headerOptions: FILE_HEADERS_ONLY }

/** The diffs a Cursor permission carries in its tool call, as one patch. */
const cursorPatch = (params: unknown): string | null => {
  const content = asRecord(asRecord(params).toolCall).content
  if (!Array.isArray(content)) return null
  const patches = content.flatMap((value) => {
    const entry = asRecord(value)
    if (entry.type !== "diff" || typeof entry.path !== "string") return []
    const before = typeof entry.oldText === "string" ? entry.oldText : null
    const after = typeof entry.newText === "string" ? entry.newText : ""
    return [
      createTwoFilesPatch(
        before === null ? "/dev/null" : entry.path,
        entry.path,
        before ?? "",
        after,
        undefined,
        undefined,
        headers,
      ),
    ]
  })
  return patches.length > 0 ? patches.join("") : null
}

/**
 * The patch an approval would apply: Claude Code sends it with the request, Cursor sends the old and
 * new text, and Codex announced the change earlier in the turn as a file-change item.
 */
export const approvalPatch = (
  request: ApprovalRequest,
  turnEvents: ReadonlyArray<CanonicalEvent>,
): string | null => {
  if (request.kind === "cursor-permission") return cursorPatch(request.params)
  if (request.kind !== "file-change") return null
  const params = asRecord(request.params)
  if (typeof params.patch === "string") return params.patch
  const itemId = params.itemId
  if (typeof itemId !== "string") return null
  const event = turnEvents.findLast(
    (candidate) => asRecord(asRecord(candidate.payload).item).id === itemId,
  )
  if (event === undefined) return null
  const patch = fileChangePatches(event)
    .map((change) => change.patch)
    .filter((text) => text.trim() !== "")
    .join("\n")
  return patch === "" ? null : patch
}

/** A line saying what the agent wants, when the request carries one beyond its title. */
export const approvalSummary = (request: ApprovalRequest): string | null => {
  if (request.kind === "user-input" || request.kind === "plan") return null
  const params = asRecord("params" in request ? request.params : null)
  // Claude Code explains each shell command in a few words.
  const description = asRecord(params.input).description
  if (request.kind === "command" && typeof description === "string" && description.trim())
    return description.trim()
  if (request.kind === "command") {
    const reason = params.reason
    return typeof reason === "string" && reason.trim() && reason.trim() !== request.detail.trim()
      ? reason.trim()
      : null
  }
  return request.detail.trim() || null
}

/** What a request asks to run or use, as labelled lines for requests that are not a diff. */
export const approvalFields = (request: ApprovalRequest): ToolField[] => {
  if (request.kind === "permissions") {
    const permissions = asRecord(request.permissions)
    // Claude Code names its tool and input; Codex sends the access it asks for.
    return "tool" in permissions ? toolFields(permissions.input) : toolFields(permissions)
  }
  if (request.kind === "cursor-permission") {
    const toolCall = asRecord(asRecord(request.params).toolCall)
    return toolFields(toolCall.rawInput ?? {})
  }
  if (request.kind === "file-change") {
    // A notebook edit, or a change whose diff is unknown, still shows what it would write.
    return toolFields(asRecord(request.params).input)
  }
  return []
}

/** The command a command approval would run. */
export const approvalCommand = (request: ApprovalRequest): string | null =>
  request.kind === "command" && request.detail.trim() ? request.detail : null
