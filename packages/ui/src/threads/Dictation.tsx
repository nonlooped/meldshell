import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  DICTATION_MODELS,
  MAX_DICTATION_SECONDS,
  type DictationModel,
  type DictationStatus,
} from "@meldshell/contracts"
import { AnimatePresence, motion } from "motion/react"
import { Check, Mic, X } from "lucide-react"
import { ActivitySpinner, useMotionPreference } from "../ui/motion"
import { IconButton } from "../ui/controls"
import { chipClasses } from "../ui/styles"
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
} from "./dictation-recorder"

const DICTATION_STATUS_KEY = ["dictation-status"] as const

/** Keyed by the chosen model so a change in Settings reads that model's state. */
export const dictationStatusQuery = (model: DictationModel | undefined) => ({
  queryKey: [...DICTATION_STATUS_KEY, model ?? "fast"],
  queryFn: () => window.meldshell.getDictationStatus(),
  staleTime: 30_000,
  // Hosts from before dictation do not know the request; the microphone just stays hidden.
  retry: false,
  // A first download reports its progress until the model is in place.
  refetchInterval: (query: { state: { data?: DictationStatus } }) =>
    query.state.data?.state === "downloading" ? 700 : false,
})

/** The device's language, which Whisper is told to expect rather than guess from a few words. */
const speakerLanguage = (): string | undefined =>
  navigator.language?.split("-")[0]?.toLowerCase() || undefined

/** How far a first download has come, or null once the model is in place. */
const downloadPercent = (status: DictationStatus | undefined): number | null =>
  status?.state === "downloading" ? Math.round((status.progress ?? 0) * 100) : null

/** The microphone's tooltip, which warns about the one-time download before it happens. */
const idleLabel = (status: DictationStatus | undefined, model: DictationModel | undefined) =>
  status && status.state !== "ready"
    ? `Dictate, after a one-time ${DICTATION_MODELS[model ?? "fast"].size} download`
    : "Dictate"

/** The last stretch of a recording counts down, so the cap never cuts someone off unawares. */
const WARN_SECONDS = 30

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
  const left = MAX_DICTATION_SECONDS * 1000 - (now - since)
  if (left <= WARN_SECONDS * 1000)
    return (
      <span className="tabular-nums text-[12px] text-[var(--color-deleted)]">
        {elapsedLabel(Math.max(0, left))} left
      </span>
    )
  return <span className="tabular-nums text-[12px]">{elapsedLabel(now - since)}</span>
}

/** Shown while speech becomes text, or while the model downloads the first time. */
function TranscribingPill({
  status,
  ref,
}: {
  readonly status: DictationStatus | undefined
  /** AnimatePresence measures the pill through this while it pops out. */
  readonly ref?: React.Ref<HTMLSpanElement>
}): React.JSX.Element {
  const reduced = useMotionPreference()
  const percent = downloadPercent(status)
  return (
    <motion.span
      ref={ref}
      role="status"
      aria-label={
        percent === null
          ? "Turning your speech into text"
          : `Downloading the speech model, once: ${percent}%`
      }
      className={`${recordingClasses} [padding:0_10px_0_8px]`}
      initial={reduced ? false : { opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ type: "spring", stiffness: 520, damping: 34 }}
    >
      <ActivitySpinner />
      {percent === null ? (
        <span className="text-[12px]">Transcribing</span>
      ) : (
        <>
          <span className="text-[12px] whitespace-nowrap">Getting model</span>
          <span
            className="block w-[44px] h-[3px] overflow-hidden rounded-full bg-[var(--surface-active)]"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </span>
          <span className="text-[11px] tabular-nums">{percent}%</span>
        </>
      )}
    </motion.span>
  )
}

interface DictationButtonProps {
  readonly threadId: string
  readonly textareaRef: React.RefObject<HTMLTextAreaElement | null>
  readonly draft: string
  readonly onDraftChange: (draft: string) => void
  readonly onError: (message: string | null) => void
  readonly disabled: boolean
  readonly model: DictationModel | undefined
}

/**
 * Records from the microphone and writes what was said at the caret. A Whisper model on the host
 * transcribes, so a phone connected through remote access dictates the same way, for free.
 */
export function DictationButton({
  threadId,
  textareaRef,
  draft,
  onDraftChange,
  onError,
  disabled,
  model,
}: DictationButtonProps): React.JSX.Element | null {
  const statusQuery = dictationStatusQuery(model)
  const status = useQuery(statusQuery)
  const shortcut = useKeybindings((state) => state.bindings.dictate)
  const client = useQueryClient()
  const reduced = useMotionPreference()
  const [phase, setPhaseState] = useState<Phase>("idle")
  // Read synchronously, so a second click or shortcut before the next render cannot start another
  // recording and leave the first one holding the microphone.
  const phaseRef = useRef<Phase>("idle")
  const setPhase = (next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }
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
      const pieces = await current.stop(keep)
      if (pieces === null) return
      const language = speakerLanguage()
      const texts: string[] = []
      // One piece at a time keeps each message small enough to cross a remote connection.
      for (const pcm of pieces) {
        const { text } = await window.meldshell.transcribeAudio({
          pcm,
          ...(language ? { language } : {}),
        })
        if (text) texts.push(text)
      }
      void client.invalidateQueries({ queryKey: DICTATION_STATUS_KEY })
      const text = texts.join(" ")
      if (text) insert(text)
      else latest.current.onError("No speech was heard. Try again a little closer to the mic.")
    } catch (error) {
      latest.current.onError(dictationError(error))
    } finally {
      setPhase("idle")
    }
  }

  const start = async () => {
    if (phaseRef.current !== "idle" || disabled) return
    onError(null)
    // The host loads the model while the person speaks, and fetches it on first use, so it is
    // ready by the time speech ends.
    void window.meldshell
      .prepareDictation()
      .then((next) => client.setQueryData(statusQuery.queryKey, next))
      .catch(() => undefined)
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
    if (phaseRef.current === "recording") void finish(true)
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

  const label = withShortcut(idleLabel(status.data, model), shortcut)
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
      ) : phase === "transcribing" ? (
        <TranscribingPill key="transcribing" status={status.data} />
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
            label={label}
            disabled={disabled || phase !== "idle" || status.isPending}
            onClick={toggle}
          >
            {phase === "starting" ? <ActivitySpinner /> : <Mic size={13} strokeWidth={1.75} />}
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
