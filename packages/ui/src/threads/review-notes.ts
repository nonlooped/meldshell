import { create } from "zustand"

/** A note left on a line or a run of lines in a diff, waiting to go back to the thread's agent. */
export interface ReviewNote {
  readonly id: string
  /** Which diff the note sits in, so it reappears only beside the lines it was written on. */
  readonly anchor: string
  readonly path: string
  /** The diff lines the note covers, in order; the note shows under the last one. */
  readonly changeKeys: ReadonlyArray<string>
  readonly startLine: number
  readonly line: number
  /** Whether the line numbers count in the old version (removed lines) or the new one. */
  readonly side: "old" | "new"
  /** The covered lines as diff text, each with its `+`, `-` or space marker. */
  readonly snippet: string
  readonly body: string
}

export type ReviewNoteInput = Omit<ReviewNote, "id">

export const useReviewNotes = create<{
  notes: Readonly<Record<string, ReadonlyArray<ReviewNote>>>
  add: (threadId: string, note: ReviewNoteInput) => void
  edit: (threadId: string, id: string, body: string) => void
  remove: (threadId: string, id: string) => void
  clear: (threadId: string, ids?: ReadonlyArray<string>) => void
}>((set) => {
  const change = (threadId: string, next: (notes: ReadonlyArray<ReviewNote>) => ReviewNote[]) =>
    set((state) => {
      const notes = next(state.notes[threadId] ?? [])
      const all = { ...state.notes, [threadId]: notes }
      if (notes.length === 0) delete all[threadId]
      return { notes: all }
    })
  return {
    notes: {},
    add: (threadId, note) =>
      change(threadId, (notes) => [...notes, { ...note, id: crypto.randomUUID() }]),
    edit: (threadId, id, body) =>
      change(threadId, (notes) => notes.map((note) => (note.id === id ? { ...note, body } : note))),
    remove: (threadId, id) => change(threadId, (notes) => notes.filter((note) => note.id !== id)),
    clear: (threadId, ids) =>
      change(threadId, (notes) => (ids ? notes.filter((note) => !ids.includes(note.id)) : [])),
  }
})

const noNotes: ReadonlyArray<ReviewNote> = []

export const useThreadReviewNotes = (threadId: string | undefined): ReadonlyArray<ReviewNote> =>
  useReviewNotes((state) => (threadId === undefined ? noNotes : (state.notes[threadId] ?? noNotes)))

/** The line or range a note covers, such as `12` or `12-15`. */
export const noteLines = (note: Pick<ReviewNote, "startLine" | "line">): string =>
  note.startLine === note.line ? `${note.line}` : `${note.startLine}-${note.line}`

/** Where a note points, as an agent would look it up: `path:line`, naming removed lines. */
export const noteLocation = (note: Pick<ReviewNote, "path" | "startLine" | "line" | "side">) => {
  const removed = note.startLine === note.line ? "removed line" : "removed lines"
  const location = `${note.path}:${noteLines(note)}`
  return note.side === "old" ? `${location} (${removed})` : location
}

/** A fence longer than any backtick run in the text, so quoted code cannot close it early. */
function fence(text: string): string {
  const longest = Math.max(0, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length))
  return "`".repeat(Math.max(3, longest + 1))
}

/**
 * All of a thread's notes as one follow-up, in file and line order, each with the line it is about
 * so the agent does not have to find it again.
 */
export function reviewNotesMessage(notes: ReadonlyArray<ReviewNote>): string {
  const sorted = [...notes].sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.startLine - right.startLine ||
      Number(left.side === "new") - Number(right.side === "new"),
  )
  const sections = sorted.map((note) => {
    const ticks = fence(note.snippet)
    return [
      `**${noteLocation(note)}**`,
      `${ticks}diff`,
      note.snippet,
      ticks,
      note.body.trim(),
    ].join("\n")
  })
  const count = notes.length === 1 ? "a review note" : `${notes.length} review notes`
  return [
    `I left ${count} on your changes. Please address ${notes.length === 1 ? "it" : "each one"}.`,
    ...sections,
  ].join("\n\n")
}
