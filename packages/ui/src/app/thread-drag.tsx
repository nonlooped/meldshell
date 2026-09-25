import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react"
import { Feedback, PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom"
import { create } from "zustand"
import { dropZone, type DropZone } from "./thread-layout"
import { useTabStore } from "./tab-store"

const threadDragType = "meldshell-thread"

type ThreadDragSource = "inbox" | "pane" | "tab"

interface ThreadDragData {
  readonly threadId: string
}

interface ThreadDropData {
  readonly threadId: string
}

interface ThreadDropPreview {
  readonly threadId: string
  readonly targetThreadId: string
  readonly zone: DropZone
}

export const useThreadDrag = create<{
  preview: ThreadDropPreview | null
}>(() => ({ preview: null }))

const pointerSensor = PointerSensor.configure({
  activationConstraints: [new PointerActivationConstraints.Distance({ value: 4 })],
})

function dataThreadId(data: Record<string, unknown> | undefined): string | null {
  return typeof data?.threadId === "string" ? data.threadId : null
}

function dropZoneAt(element: Element, x: number, y: number): DropZone {
  const bounds = element.getBoundingClientRect()
  return dropZone((x - bounds.left) / bounds.width, (y - bounds.top) / bounds.height)
}

function previewFor(
  sourceData: Record<string, unknown> | undefined,
  targetData: Record<string, unknown> | undefined,
  targetElement: Element | undefined,
  x: number,
  y: number,
): ThreadDropPreview | null {
  const threadId = dataThreadId(sourceData)
  const targetThreadId = dataThreadId(targetData)
  if (
    threadId === null ||
    targetThreadId === null ||
    threadId === targetThreadId ||
    targetElement === undefined
  )
    return null
  return { threadId, targetThreadId, zone: dropZoneAt(targetElement, x, y) }
}

export function ThreadDragProvider({ children }: React.PropsWithChildren): React.JSX.Element {
  return (
    <DragDropProvider
      sensors={[pointerSensor]}
      onDragStart={() => {
        useThreadDrag.setState({ preview: null })
      }}
      onDragMove={({ operation, to }) => {
        const position = to ?? operation.position.current
        useThreadDrag.setState({
          preview: previewFor(
            operation.source?.data,
            operation.target?.data,
            operation.target?.element,
            position.x,
            position.y,
          ),
        })
      }}
      onDragOver={({ operation }) => {
        const position = operation.position.current
        useThreadDrag.setState({
          preview: previewFor(
            operation.source?.data,
            operation.target?.data,
            operation.target?.element,
            position.x,
            position.y,
          ),
        })
      }}
      onDragEnd={({ canceled, operation }) => {
        const preview = previewFor(
          operation.source?.data,
          operation.target?.data,
          operation.target?.element,
          operation.position.current.x,
          operation.position.current.y,
        )
        useThreadDrag.setState({ preview: null })
        if (!canceled && preview !== null)
          useTabStore.getState().dropThread(preview.targetThreadId, preview.threadId, preview.zone)
      }}
    >
      {children}
    </DragDropProvider>
  )
}

export function useThreadDraggable(
  threadId: string,
  source: ThreadDragSource,
  disabled = false,
): ReturnType<typeof useDraggable<ThreadDragData>> {
  return useDraggable<ThreadDragData>({
    id: `thread:${source}:${threadId}`,
    type: threadDragType,
    data: { threadId },
    disabled,
    plugins: [Feedback.configure({ feedback: "clone", dropAnimation: null })],
  })
}

export function useThreadDroppable(
  threadId: string,
): ReturnType<typeof useDroppable<ThreadDropData>> {
  return useDroppable<ThreadDropData>({
    id: `thread-pane:${threadId}`,
    type: "thread-pane",
    accept: (source) => source.type === threadDragType && dataThreadId(source.data) !== threadId,
    data: { threadId },
  })
}
