import { asRecord, type CanonicalEvent } from "@meldshell/contracts"

function wholeFilePatch(diff: string, name: string, destination: string, added: boolean): string {
  if (diff === "") return ""
  const lines = diff.replace(/\n$/, "").split("\n")
  const body = lines.map((line) => `${added ? "+" : "-"}${line}`).join("\n")
  const sourceHeader = added ? "/dev/null" : name
  const destinationHeader = added ? destination : "/dev/null"
  const sourceRange = added ? "0,0" : `1,${lines.length}`
  const destinationRange = added ? `1,${lines.length}` : "0,0"
  const endMarker = diff.endsWith("\n") ? "" : "\\ No newline at end of file\n"
  return `--- ${sourceHeader}\n+++ ${destinationHeader}\n@@ -${sourceRange} +${destinationRange} @@\n${body}\n${endMarker}`
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
