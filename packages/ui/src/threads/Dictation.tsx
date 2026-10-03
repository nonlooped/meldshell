import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { Check, Mic, X } from "lucide-react"
import { ActivitySpinner, useMotionPreference } from "../ui/motion"
import { IconButton } from "../ui/controls"
import { chipClasses } from "../ui/styles"
import { useViewStore } from "../app/view-store"
import { useKeybindings, withShortcut } from "../app/keybindings"
import {
  canRecord,
  dictationError,
  elapsedLabel,
  insertDictation,
  microphoneProblem,
  startRecording,
  useDictationRequests,
  type Recording,
} from "./dictation"

export const dictationStatusQuery = {
  queryKey: ["dictation-status"],
  queryFn: () => window.meldshell.getDictationStatus(),
  staleTime: 30_000,
  // Hosts from before dictation do not know the request; the microphone just stays hidden.
  retry: false,
} as const

type Phase = "idle" | "starting" | "recording" | "transcribing"

const BARS = 18

/** A rolling trace of the microphone's loudness, newest on the right. */
function LevelMeter({ analyser }: { analyser: AnalyserNode }): React.JSX.Element {
  const bars = useRef<HTMLSpanElement[]>([])
  const reduced = useMotionPreference()
  useEffect(() => {
    const samples = new Uint8Array(analyser.fftSize)
    const history = new Array<number>(BARS).fill(0)
    let frame = 0
    let last = 0
    const draw = (time: number) => {
      frame = requestAnimationFrame(draw)
      // About sixteen columns a second reads as speech without flickering.
      if (time - last < 60) return
      last = time
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) sum += ((sample - 128) / 128) ** 2
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 4.5)
      if (reduced) history.fill(level)
      else {
        history.shift()
        history.push(level)
      }
      history.forEach((value, index) => {
        const bar = bars.current[index]
        if (bar) bar.style.transform = `scaleY(${Math.max(0.12, value)})`
      })
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [analyser, reduced])
  return (
    <span className="flex h-[16px] items-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: BARS }, (_, index) => (
        <span
          key={index}
          ref={(element) => {
            if (element) bars.current[index] = element
          }}
          className="block w-[2px] h-full rounded-[1px] bg-current origin-center [transform:scaleY(0.12)] transition-transform duration-75"
        />
      ))}
    </span>
  )
}

function Elapsed({ since }: { since: number }): React.JSX.Element {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(timer)
  }, [])
  return <span className="tabular-nums text-[11.5px]">{elapsedLabel(now - since)}</span>
}

interface DictationButtonProps {
  readonly threadId: string
  readonly textareaRef: React.RefObject<HTMLTextAreaElement | null>
  readonly draft: string
  readonly onDraftChange: (draft: string) => void
  readonly onError: (message: string | null) => void
  readonly disabled: boolean
}

/**
 * Records from the microphone and writes what was said at the caret. The host transcribes, so a
 * phone connected through remote access dictates the same way the desktop does.
 */
export function DictationButton({
  threadId,
  textareaRef,
  draft,
  onDraftChange,
  onError,
  disabled,
}: DictationButtonProps): React.JSX.Element | null {
  const status = useQuery(dictationStatusQuery)
  const shortcut = useKeybindings((state) => state.bindings.dictate)
  const openSettings = useViewStore((state) => state.openSettings)
  const reduced = useMotionPreference()
  const [phase, setPhase] = useState<Phase>("idle")
  const [recording, setRecording] = useState<Recording | null>(null)
  // Callbacks outlive renders while audio is in flight, so they read the latest draft here.
  const latest = useRef({ draft, onDraftChange, onError })
  latest.current = { draft, onDraftChange, onError }
  const active = useRef<Recording | null>(null)

  const insert = (text: string) => {
    const textarea = textareaRef.current
    const { draft: current, onDraftChange: change } = latest.current
    const start = textarea?.selectionStart ?? current.length
    const end = textarea?.selectionEnd ?? current.length
    const next = insertDictation(current, start, end, text)
    // Typing the text keeps it on the field's undo stack; touch devices skip it so the
    // on-screen keyboard does not open over the conversation.
    const touch = matchMedia("(pointer: coarse)").matches
    if (textarea && !touch) {
      textarea.focus()
      textarea.setSelectionRange(start, end)
      if (document.execCommand("insertText", false, next.insert)) return
    }
    change(next.draft)
    requestAnimationFrame(() => textarea?.setSelectionRange(next.caret, next.caret))
  }

  const finish = async (keep: boolean) => {
    const current = active.current
    if (current === null) return
    active.current = null
    setRecording(null)
    setPhase(keep ? "transcribing" : "idle")
    try {
      const audio = await current.stop(keep)
      if (audio === null) return
      const textarea = textareaRef.current
      const prompt = latest.current.draft.slice(0, textarea?.selectionStart ?? undefined)
      const { text } = await window.meldshell.transcribeAudio({
        ...audio,
        ...(prompt.trim() ? { prompt } : {}),
      })
      if (text) insert(text)
      else latest.current.onError("No speech was heard. Try again a little closer to the mic.")
    } catch (error) {
      latest.current.onError(dictationError(error))
    } finally {
      setPhase("idle")
    }
  }

  const start = async () => {
    if (phase !== "idle" || disabled) return
    if (!status.data?.ready) {
      openSettings("dictation")
      return
    }
    onError(null)
    setPhase("starting")
    try {
      const next = await startRecording(() => void finish(true))
      active.current = next
      setRecording(next)
      setPhase("recording")
    } catch (error) {
      onError(microphoneProblem(error))
      setPhase("idle")
    }
  }

  const toggle = () => {
    if (phase === "recording") void finish(true)
    else void start()
  }
  const toggleRef = useRef(toggle)
  toggleRef.current = toggle

  // The shortcut toggles dictation in the thread in front.
  const request = useDictationRequests((state) => state.request)
  const handled = useRef(request?.id ?? 0)
  useEffect(() => {
    if (request === null || request.id === handled.current) return
    handled.current = request.id
    if (request.threadId === threadId) toggleRef.current()
  }, [request, threadId])

  // Escape abandons a recording; leaving the thread does too.
  useEffect(() => {
    if (phase !== "recording") return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      void finish(false)
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  })
  useEffect(() => () => void active.current?.stop(false), [])

  if (!canRecord() || status.isError) return null

  const label = withShortcut(
    status.data?.ready === false ? "Set up dictation" : "Dictate",
    shortcut,
  )
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {phase === "recording" && recording !== null ? (
        <motion.span
          key="recording"
          role="status"
          aria-label="Recording. Stop to write it into the message, or press Escape to discard."
          className={recordingClasses}
          initial={reduced ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: reduced ? 1 : 0.9, transition: { duration: 0.12 } }}
          transition={{ type: "spring", stiffness: 520, damping: 32 }}
        >
          <IconButton
            unstyled
            className={pillButtonClasses}
            label="Discard recording (Esc)"
            onClick={() => void finish(false)}
          >
            <X size={13} strokeWidth={2} />
          </IconButton>
          <span className="flex items-center gap-[7px] text-[var(--color-deleted)]">
            <span
              className={`w-[6px] h-[6px] rounded-full bg-current ${reduced ? "" : "animate-pulse"}`}
              aria-hidden="true"
            />
            <LevelMeter analyser={recording.analyser} />
          </span>
          <Elapsed since={recording.startedAt} />
          <IconButton
            unstyled
            className={`${pillButtonClasses} bg-[var(--accent)]! text-[var(--accent-foreground)]! [&:hover]:bg-[var(--accent-hover)]!`}
            label={withShortcut("Stop and write it in", shortcut)}
            onClick={() => void finish(true)}
          >
            <Check size={13} strokeWidth={2.5} />
          </IconButton>
        </motion.span>
      ) : (
        <motion.span
          key="idle"
          className="inline-flex"
          initial={reduced ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
        >
          <IconButton
            unstyled
            className={`motion-colors flex-none ${chipClasses}`}
            label={phase === "transcribing" ? "Writing what you said…" : label}
            disabled={disabled || phase !== "idle" || status.isPending}
            onClick={toggle}
          >
            {phase === "idle" ? <Mic size={13} strokeWidth={1.75} /> : <ActivitySpinner />}
          </IconButton>
        </motion.span>
      )}
    </AnimatePresence>
  )
}

const recordingClasses = [
  "inline-flex h-[28px] flex-none items-center gap-[8px] [padding:0_2px]",
  "[@media(pointer:coarse)]:h-[36px]",
  "rounded-full border-[1px] border-[color:var(--line)] bg-[var(--surface-hover)]",
  "text-[var(--text-secondary)]",
].join(" ")

const pillButtonClasses = [
  "motion-colors grid w-[22px] h-[22px] flex-none place-items-center rounded-full border-0 p-0",
  "[@media(pointer:coarse)]:w-[30px] [@media(pointer:coarse)]:h-[30px]",
  "bg-transparent text-[var(--text-secondary)] cursor-default",
  "[&:hover]:bg-[var(--surface-active)] [&:hover]:text-[var(--text-primary)]",
].join(" ")
