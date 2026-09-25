import { asRecord, type CanonicalEvent } from "@meldshell/contracts"
import { createTwoFilesPatch, FILE_HEADERS_ONLY } from "diff"

const headers = { headerOptions: FILE_HEADERS_ONLY }

/** A patch that adds or deletes a whole file, from the file's content. */
function wholeFilePatch(
  content: string,
  name: string,
  destination: string,
  added: boolean,
): string {
  if (content === "") return ""
  return added
    ? createTwoFilesPatch("/dev/null", destination, "", content, undefined, undefined, headers)
    : createTwoFilesPatch(name, "/dev/null", content, "", undefined, undefined, headers)
}

export function fileChangePatches(event: CanonicalEvent): Array<{ path: string; patch: string }> {
  if (event.method === "turn/diff/updated") {
    return [{ path: "Turn changes", patch: event.text ?? "" }]
  }
  const changes = asRecord(asRecord(event.payload).item).changes
  if (!Array.isArray(changes)) return []
  return changes.map((value) => {
    const change = asRecord(value)
    const path = typeof change.path === "string" ? change.path : "File change"
    const diff = typeof change.diff === "string" ? change.diff : ""
    const kind = asRecord(change.kind)
    const name = path.replaceAll("\\", "/")
    const destination =
      typeof kind.move_path === "string" ? kind.move_path.replaceAll("\\", "/") : name
    if (kind.type === "add" || kind.type === "delete") {
      return { path, patch: wholeFilePatch(diff, name, destination, kind.type === "add") }
    }
    return {
      path,
      patch: diff.startsWith("@@ ") ? `--- ${name}\n+++ ${destination}\n${diff}` : diff,
    }
  })
}

export function turnChangePatches(events: ReadonlyArray<CanonicalEvent>) {
  const combined = events.findLast((event) => event.method === "turn/diff/updated")
  if (combined) return fileChangePatches(combined).filter(({ patch }) => patch.trim() !== "")
  return events
    .filter((event) => {
      const item = asRecord(asRecord(event.payload).item)
      return event.kind === "file-change" && item.status !== "failed" && item.status !== "declined"
    })
    .flatMap(fileChangePatches)
}
