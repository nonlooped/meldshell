import { useEffect, useRef, useState } from "react"
import type { RemotePreviewFrame, RemotePreviewInput } from "@meldshell/contracts/remote-preview"
import { errorMessage } from "@meldshell/contracts"
import { ArrowLeft, ArrowRight, RotateCw, X } from "lucide-react"
import { Button, IconButton, TextField } from "../ui/controls"
import { usePreviewStore } from "./preview-store"
import { previewAddress } from "./server-urls"

const modifiers = (
  event: React.KeyboardEvent | React.PointerEvent,
): NonNullable<RemotePreviewInput["modifiers"]> => [
  ...(event.shiftKey ? ["shift" as const] : []),
  ...(event.ctrlKey ? ["control" as const] : []),
  ...(event.altKey ? ["alt" as const] : []),
  ...(event.metaKey ? ["meta" as const] : []),
]

function dimensions(element: HTMLElement | null) {
  const rect = element?.getBoundingClientRect()
  return {
    width: Math.max(320, Math.min(1920, Math.round(rect?.width ?? 1024))),
    height: Math.max(240, Math.min(1080, Math.round(rect?.height ?? 768))),
  }
}

const captureVisible = (id: string, viewport: HTMLElement | null) =>
  document.visibilityState === "visible"
    ? window.meldshell.remotePreview!({ id, action: "capture", ...dimensions(viewport) })
    : Promise.resolve(null)

export function RemotePreview({ threadId, url }: { threadId: string; url: string }) {
  const [id] = useState(() => crypto.randomUUID())
  const [draft, setDraft] = useState(url)
  const [frame, setFrame] = useState<RemotePreviewFrame | null>(null)
  const [error, setError] = useState<string | null>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const lastPointer = useRef(0)
  const [text, setText] = useState("")
  const send = (input: Omit<RemotePreviewInput, "id">) => {
    void window.meldshell.remotePreview!({ id, ...input }).catch((cause) =>
      setError(errorMessage(cause)),
    )
  }
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const capture = async () => {
      if (!active) return
      try {
        const next = await captureVisible(id, viewport.current)
        if (active && next) {
          setFrame(next)
          setError(next.error)
        }
      } catch (cause) {
        if (active) setError(errorMessage(cause))
      }
      if (active)
        timer = setTimeout(() => {
          void capture()
        }, 500)
    }
    void window.meldshell.remotePreview!({ id, action: "navigate", url }).then(capture, (cause) => {
      if (active) setError(errorMessage(cause))
    })
    return () => {
      active = false
      clearTimeout(timer)
      void window.meldshell.remotePreview!({ id, action: "close" }).catch(() => undefined)
    }
  }, [id, url])
  const point = (event: React.PointerEvent | React.WheelEvent) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(
        0,
        Math.min(
          frame?.width ?? 1920,
          Math.round(((event.clientX - rect.left) * (frame?.width ?? rect.width)) / rect.width),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          frame?.height ?? 1080,
          Math.round(((event.clientY - rect.top) * (frame?.height ?? rect.height)) / rect.height),
        ),
      ),
    }
  }
  const key = (event: React.KeyboardEvent, action: "keyDown" | "keyUp") => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") return
    event.preventDefault()
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (action === "keyDown") send({ action: "text", text: event.key })
    } else
      send({ action, key: event.key === " " ? "Space" : event.key, modifiers: modifiers(event) })
  }
  return (
    <section
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,_1fr)]"
      aria-label="Remote host preview"
    >
      <form
        className="flex flex-wrap items-center gap-[4px] p-[6px]"
        onSubmit={(event) => {
          event.preventDefault()
          const next = previewAddress(draft)
          if (next) {
            if (next === url) send({ action: "navigate", url: next })
            else usePreviewStore.getState().show(threadId, next)
          }
        }}
      >
        <IconButton label="Back" disabled={!frame?.back} onClick={() => send({ action: "back" })}>
          <ArrowLeft size={14} />
        </IconButton>
        <IconButton
          label="Forward"
          disabled={!frame?.forward}
          onClick={() => send({ action: "forward" })}
        >
          <ArrowRight size={14} />
        </IconButton>
        <IconButton
          label="Reload"
          onClick={() => send({ action: "navigate", url: frame?.url || url })}
        >
          <RotateCw size={14} />
        </IconButton>
        <TextField
          aria-label="Host preview address"
          className="flex-1 min-w-[120px]"
          value={draft}
          onValueChange={setDraft}
        />
        <Button type="submit">Go</Button>
        <IconButton
          label="Hide preview"
          onClick={() => usePreviewStore.getState().toggle(threadId)}
        >
          <X size={15} />
        </IconButton>
        <TextField
          aria-label="Type in host page"
          placeholder="Type in host page"
          value={text}
          onValueChange={setText}
        />
        <Button
          disabled={!text}
          onClick={() => {
            send({ action: "text", text })
            setText("")
          }}
        >
          Send text
        </Button>
        {error && (
          <p role="alert" className="w-full m-0">
            {error}
          </p>
        )}
      </form>
      <div ref={viewport} className="min-h-0 min-w-0 overflow-auto bg-white">
        {frame ? (
          <div
            role="application"
            aria-label={frame.title || "Host page. Click to interact, or paste text."}
            tabIndex={0}
            style={{
              width: "100%",
              aspectRatio: `${frame.width} / ${frame.height}`,
              touchAction: "none",
            }}
            onPointerDown={(event) => {
              event.currentTarget.focus()
              event.currentTarget.setPointerCapture(event.pointerId)
              send({
                action: "mouseDown",
                ...point(event),
                button: event.button === 2 ? "right" : "left",
                modifiers: modifiers(event),
              })
            }}
            onPointerMove={(event) => {
              if (Date.now() - lastPointer.current < 80) return
              lastPointer.current = Date.now()
              send({ action: "mouseMove", ...point(event), modifiers: modifiers(event) })
            }}
            onPointerCancel={(event) => send({ action: "mouseUp", ...point(event) })}
            onPointerUp={(event) => {
              send({
                action: "mouseUp",
                ...point(event),
                button: event.button === 2 ? "right" : "left",
                modifiers: modifiers(event),
              })
            }}
            onWheel={(event) => {
              send({
                action: "mouseWheel",
                ...point(event),
                deltaX: Math.max(-10000, Math.min(10000, event.deltaX)),
                deltaY: Math.max(-10000, Math.min(10000, event.deltaY)),
              })
            }}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => key(event, "keyDown")}
            onKeyUp={(event) => key(event, "keyUp")}
            onPaste={(event) => {
              event.preventDefault()
              send({ action: "text", text: event.clipboardData.getData("text") })
            }}
          >
            <img
              src={frame.image}
              alt=""
              draggable={false}
              className="block w-full pointer-events-none"
            />
          </div>
        ) : (
          <p>Connecting to the host browser…</p>
        )}
      </div>
    </section>
  )
}
