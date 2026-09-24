import { useState } from "react"
import { RotateCcw, X } from "lucide-react"
import type { SetAppSettingsInput } from "@meldshell/contracts"
import {
  chordFromEvent,
  chordLabel,
  chordProblem,
  type Keybindings,
  overridesFor,
  SHORTCUTS,
  type ShortcutAction,
  type ShortcutDefinition,
  useKeybindings,
} from "../app/keybindings"
import { Button, IconButton } from "../ui/controls"
import { kbdClasses } from "../ui/styles"

const GROUPS = ["Navigation", "Tabs", "Panels", "Workspace"] as const

/** Records the next chord pressed while it has focus; Escape or leaving it cancels. */
function ChordRecorder({
  definition,
  chord,
  onRecord,
  onProblem,
}: {
  definition: ShortcutDefinition
  chord: string
  onRecord: (chord: string) => void
  onProblem: (message: string) => void
}): React.JSX.Element {
  const [recording, setRecording] = useState(false)
  return (
    <button
      type="button"
      className={`motion-colors flex h-[30px] min-w-[132px] items-center justify-center [padding:0_10px] border-[1px] rounded-[var(--radius-sm)] bg-transparent cursor-default text-[12px] ${
        recording
          ? "border-[color:var(--accent)] text-[var(--text-primary)]"
          : "border-[color:var(--line)] text-[var(--text-secondary)] [&:hover]:bg-[var(--surface-hover)]"
      }`}
      aria-label={
        recording
          ? `Press the new shortcut for ${definition.label}, or Escape to cancel`
          : `Change the shortcut for ${definition.label}, currently ${chordLabel(chord)}`
      }
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(event) => {
        if (!recording) return
        // Recording owns every key, so app shortcuts and focus movement wait until it ends.
        event.preventDefault()
        event.stopPropagation()
        if (event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.metaKey) {
          setRecording(false)
          return
        }
        const next = chordFromEvent(event.nativeEvent)
        if (next === null) return
        const problem = chordProblem(next)
        setRecording(false)
        if (problem !== null) onProblem(problem)
        else onRecord(next)
      }}
    >
      {recording ? (
        <span className="text-[var(--text-tertiary)]">Press a shortcut…</span>
      ) : chord === "" ? (
        <span className="text-[var(--text-tertiary)]">None</span>
      ) : (
        <kbd className={kbdClasses}>{chord}</kbd>
      )}
    </button>
  )
}

export function KeyboardSettings({
  pending,
  onChange,
}: {
  readonly pending: boolean
  readonly onChange: (input: SetAppSettingsInput) => void
}): React.JSX.Element {
  const bindings = useKeybindings((state) => state.bindings)
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null)

  const save = (next: Keybindings) => {
    // Shown at once; the saved settings arrive with the next snapshot.
    useKeybindings.setState({ bindings: next })
    onChange({ keybindings: overridesFor(next) })
  }
  const assign = (id: ShortcutAction, chord: string) => {
    const next: Record<ShortcutAction, string> = { ...bindings, [id]: chord }
    const taken =
      chord === ""
        ? undefined
        : SHORTCUTS.find((entry) => entry.id !== id && bindings[entry.id] === chord)
    if (taken !== undefined) next[taken.id] = ""
    setNotice(
      taken === undefined
        ? null
        : {
            tone: "info",
            text: `${chord} no longer runs “${taken.label}”, which now has no shortcut.`,
          },
    )
    save(next)
  }
  const customized = SHORTCUTS.some((entry) => bindings[entry.id] !== entry.chord)

  return (
    <section className="max-w-[720px]">
      <p className="[margin:0_0_20px] text-[var(--text-secondary)] text-[12px] leading-[1.6]">
        Select a shortcut and press the keys you want instead. Shortcuts need Ctrl, Alt, or the
        system key unless they use a function key. While a terminal has focus, only the tab and
        terminal shortcuts reach MeldShell; every other key goes to the shell.
      </p>
      {notice !== null && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`[margin:0_0_16px] text-[12px] ${
            notice.tone === "error" ? "text-[var(--color-deleted)]" : "text-[var(--text-secondary)]"
          }`}
        >
          {notice.text}
        </p>
      )}
      {GROUPS.map((group) => (
        <div key={group} className="mb-[24px]">
          <h3 className="[margin:0_0_4px] text-[var(--text-secondary)] text-[12px] font-medium">
            {group}
          </h3>
          <div className="border-t-[1px] border-t-[color:var(--line-subtle)]">
            {SHORTCUTS.filter((entry) => entry.group === group).map((entry) => {
              const chord = bindings[entry.id]
              const changed = chord !== entry.chord
              return (
                <div
                  key={entry.id}
                  className="flex min-h-[48px] items-center justify-between gap-[24px] [padding:8px_0] border-b-[1px] border-b-[color:var(--line-subtle)]"
                >
                  <span className="min-w-0 text-[var(--text-primary)] text-[13px]">
                    {entry.label}
                    {changed && (
                      <span className="ml-[8px] text-[var(--text-tertiary)] text-[11px]">
                        Default {chordLabel(entry.chord)}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-none items-center gap-[4px]">
                    <ChordRecorder
                      definition={entry}
                      chord={chord}
                      onRecord={(next) => assign(entry.id, next)}
                      onProblem={(text) => setNotice({ tone: "error", text })}
                    />
                    <IconButton
                      label={`Remove the shortcut for ${entry.label}`}
                      disabled={pending || chord === ""}
                      onClick={() => assign(entry.id, "")}
                    >
                      <X size={14} />
                    </IconButton>
                    <IconButton
                      label={`Restore the default shortcut for ${entry.label}`}
                      disabled={pending || !changed}
                      onClick={() => assign(entry.id, entry.chord)}
                    >
                      <RotateCcw size={14} />
                    </IconButton>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <Button
        disabled={pending || !customized}
        onClick={() => {
          setNotice(null)
          save(Object.fromEntries(SHORTCUTS.map((entry) => [entry.id, entry.chord])) as Keybindings)
        }}
      >
        Restore all defaults
      </Button>
    </section>
  )
}
