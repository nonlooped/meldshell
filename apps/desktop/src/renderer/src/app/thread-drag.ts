import type { DragEvent } from "react"
import { create } from "zustand"

/*
 * Drag payloads are readable only on drop, so panes also keep the dragged thread in a store: it is
 * what lets a pane show its drop preview while the pointer is still moving over it.
 */
export const threadDragType = "application/x-meldshell-thread"

export const useThreadDrag = create<{ threadId: string | null }>(() => ({ threadId: null }))

function startThreadDrag(event: DragEvent, threadId: string): void {
  event.dataTransfer.setData(threadDragType, threadId)
  event.dataTransfer.effectAllowed = "move"
  useThreadDrag.setState({ threadId })
}

export function endThreadDrag(): void {
  useThreadDrag.setState({ threadId: null })
}

/** Props shared by every place a thread can be picked up: the tab strip, the inbox, a pane header. */
export const threadDragProps = (threadId: string) => ({
  draggable: true,
  onDragStart: (event: DragEvent) => startThreadDrag(event, threadId),
  onDragEnd: endThreadDrag,
})
