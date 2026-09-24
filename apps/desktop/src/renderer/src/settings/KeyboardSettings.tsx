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
import { Button, ChordKeys, IconButton } from "../ui/controls"

const GROUPS = ["Navigation", "Tabs", "Panels", "Workspace"] as const

/** A message about one shortcut, shown under its row. `undo` restores the chords before a change. */
interface RowNotice {
  readonly id: ShortcutAction
  readonly tone: "info" | "error"
  readonly text: string
  readonly undo?: Keybindings
}

/** The modifiers held during a key press, in chord order, while the key itself is still to come. */
function heldModifiers(event: React.KeyboardEvent): string {
  const held = [
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Meta",
  ].filter(Boolean)
  return held.length === 0 ? "" : `${held.join("+")}+`
}

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
  // Modifiers held so far, so the recorder shows the chord taking shape.
  const [held, setHeld] = useState("")
  const stop = () => {
    setRecording(false)
    setHeld("")
  }
  return (
    <button
      type="button"
      className={`motion-colors flex h-[30px] min-w-[148px] items-center justify-center [padding:0_10px] border-[1px] rounded-[var(--radius-sm)] cursor-default text-[12px] ${
        recording
          ? "border-[color:var(--accent)] bg-[color-mix(in_srgb,_var(--accent)_10%,_transparent)] text-[var(--text-primary)] [box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--accent)_16%,_transparent)]"
          : "border-[color:var(--line)] bg-transparent text-[var(--text-secondary)] [&:hover]:bg-[var(--surface-hover)] [&:hover]:[border-color:var(--line-strong)]"
      }`}
      aria-label={
        recording
          ? `Press the new shortcut for ${definition.label}, or Escape to cancel`
          : `Change the shortcut for ${definition.label}, currently ${chordLabel(chord)}`
      }
      onClick={() => setRecording(true)}
      onBlur={stop}
      onKeyUp={(event) => {
        if (recording) setHeld(heldModifiers(event))
      }}
      onKeyDown={(event) => {
        if (!recording) return
        // Recording owns every key, so app shortcuts and focus movement wait until it ends.
        event.preventDefault()
        event.stopPropagation()
        if (event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.metaKey) {
          stop()
          return
        }
        const next = chordFromEvent(event.nativeEvent)
        if (next === null) {
          setHeld(heldModifiers(event))
          return
        }
        const problem = chordProblem(next)
        stop()
        if (problem !== null) onProblem(problem)
        else onRecord(next)
      }}
    >
      {recording ? (
        held === "" ? (
          <span className="text-[var(--text-secondary)]">Press keys…</span>
        ) : (
          <span className="inline-flex items-center gap-[3px] text-[var(--text-secondary)]">
            <ChordKeys chord={held.slice(0, -1)} />
            <span aria-hidden="true">+ …</span>
          </span>
        )
      ) : chord === "" ? (
        <span className="text-[var(--text-tertiary)]">Not set</span>
      ) : (
        <ChordKeys chord={chord} />
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
  const [notice, setNotice] = useState<RowNotice | null>(null)

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
            id,
            tone: "info",
            text: `Moved from “${taken.label}”, which now has no shortcut.`,
            undo: bindings,
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
      {GROUPS.map((group) => (
        <div key={group} className="mb-[24px]">
          <h3 className="[margin:0_0_4px] text-[var(--text-secondary)] text-[12px] font-medium">
            {group}
          </h3>
          <div className="border-t-[1px] border-t-[color:var(--line-subtle)]">
            {SHORTCUTS.filter((entry) => entry.group === group).map((entry) => {
              const chord = bindings[entry.id]
              const changed = chord !== entry.chord
              const rowNotice = notice?.id === entry.id ? notice : null
              return (
                <div
                  key={entry.id}
                  className="group/shortcut [padding:8px_0] border-b-[1px] border-b-[color:var(--line-subtle)]"
                >
                  <div className="flex min-h-[32px] items-center justify-between gap-[24px]">
                    <span className="flex min-w-0 flex-col gap-[1px]">
                      <span className="text-[var(--text-primary)] text-[13px]">{entry.label}</span>
                      {changed && (
                        <span className="text-[var(--text-tertiary)] text-[11px]">
                          Default: {chordLabel(entry.chord)}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-none items-center gap-[2px]">
                      <ChordRecorder
                        definition={entry}
                        chord={chord}
                        onRecord={(next) => assign(entry.id, next)}
                        onProblem={(text) => setNotice({ id: entry.id, tone: "error", text })}
                      />
                      {/* Removing is always possible, so it waits for the row to be pointed at. */}
                      <span className="opacity-[0] motion-colors group-hover/shortcut:opacity-[1] group-focus-within/shortcut:opacity-[1] [@media(hover:_none)]:opacity-[1]">
                        <IconButton
                          label={`Remove the shortcut for ${entry.label}`}
                          disabled={pending || chord === ""}
                          onClick={() => assign(entry.id, "")}
                        >
                          <X size={14} />
                        </IconButton>
                      </span>
                      <span className={changed ? "" : "invisible"}>
                        <IconButton
                          label={`Restore ${chordLabel(entry.chord)} for ${entry.label}`}
                          disabled={pending || !changed}
                          onClick={() => assign(entry.id, entry.chord)}
                        >
                          <RotateCcw size={14} />
                        </IconButton>
                      </span>
                    </span>
                  </div>
                  {rowNotice !== null && (
                    <p
                      role={rowNotice.tone === "error" ? "alert" : "status"}
                      className={`flex items-center gap-[8px] [margin:4px_0_0] text-[11.5px] ${
                        rowNotice.tone === "error"
                          ? "text-[var(--color-deleted)]"
                          : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {rowNotice.text}
                      {rowNotice.undo !== undefined && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            if (rowNotice.undo !== undefined) save(rowNotice.undo)
                            setNotice(null)
                          }}
                        >
                          Undo
                        </Button>
                      )}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <Button
        disabled={pending || !customized}
        icon={<RotateCcw size={13} />}
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
