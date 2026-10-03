import { useState } from "react"
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import type { AppSnapshot, Loadout, SetAppSettingsInput } from "@meldshell/contracts"
import { LOADOUT_ACTIONS, useKeybindings } from "../app/keybindings"
import { Button, ChordKeys, IconButton, PanelNote, TextField } from "../ui/controls"
import {
  describeLoadout,
  loadoutSelection,
  moveLoadout,
  renameLoadout,
} from "../threads/loadout-model"

/** Renames on Enter or leaving the field; Escape puts the saved name back. */
function LoadoutName({
  loadout,
  disabled,
  onRename,
}: {
  readonly loadout: Loadout
  readonly disabled: boolean
  readonly onRename: (name: string) => void
}): React.JSX.Element {
  const [name, setName] = useState(loadout.name)
  const [saved, setSaved] = useState(loadout.name)
  if (saved !== loadout.name) {
    setSaved(loadout.name)
    setName(loadout.name)
  }
  return (
    <TextField
      aria-label={`Name of ${loadout.name}`}
      value={name}
      maxLength={48}
      disabled={disabled}
      className="h-[28px]! text-[13px]! font-medium [&:not(:hover):not(:focus)]:[border-color:transparent]! [&:not(:hover):not(:focus)]:bg-transparent!"
      onValueChange={setName}
      onBlur={() => {
        if (name.trim() === "") setName(loadout.name)
        else if (name.trim() !== loadout.name) onRename(name)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") {
          setName(loadout.name)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function LoadoutSettings({
  snapshot,
  pending,
  onChange,
}: {
  readonly snapshot: AppSnapshot
  readonly pending: boolean
  readonly onChange: (input: SetAppSettingsInput) => void
}): React.JSX.Element {
  const loadouts = snapshot.settings.loadouts ?? []
  const bindings = useKeybindings((state) => state.bindings)
  const [removed, setRemoved] = useState<{
    readonly name: string
    readonly before: ReadonlyArray<Loadout>
  } | null>(null)
  const save = (next: ReadonlyArray<Loadout>) => onChange({ loadouts: next })

  return (
    <section className="max-w-[720px]">
      <p className="[margin:0_0_20px] text-[var(--text-secondary)] text-[12px] leading-[1.6]">
        A loadout remembers an agent, model, and reasoning effort together. Save one from the foot
        of the composer's model picker, then switch a thread to it from there or with its shortcut.
        A thread keeps its own mode and permissions. The order here sets which shortcut each one
        uses.
      </p>
      {loadouts.length === 0 ? (
        <PanelNote>
          No loadouts yet. Set up the composer the way you like, then choose Save current setup from
          its loadout menu.
        </PanelNote>
      ) : (
        <ol className="m-0 p-0 list-none border-t-[1px] border-t-[color:var(--line-subtle)]">
          {loadouts.map((loadout, index) => {
            const action = LOADOUT_ACTIONS[index]
            const chord = action === undefined ? "" : bindings[action]
            const selection = loadoutSelection(snapshot, loadout)
            return (
              <li
                key={loadout.id}
                className="group/loadout flex items-center gap-[14px] [padding:10px_0] border-b-[1px] border-b-[color:var(--line-subtle)]"
              >
                <span className="flex w-[64px] flex-none justify-start text-[11px] text-[var(--text-tertiary)]">
                  {chord === "" ? "No shortcut" : <ChordKeys chord={chord} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <LoadoutName
                    loadout={loadout}
                    disabled={pending}
                    onRename={(name) => save(renameLoadout(loadouts, loadout.id, name))}
                  />
                  <span
                    className={`overflow-hidden text-ellipsis whitespace-nowrap pl-[9px] text-[11.5px] ${selection === null ? "text-[var(--color-modified)]" : "text-[var(--text-tertiary)]"}`}
                  >
                    {selection === null
                      ? "Its model is turned off or removed. Turn it back on in Providers to use this loadout."
                      : describeLoadout(selection)}
                  </span>
                </span>
                <span className="flex flex-none items-center gap-[2px]">
                  <IconButton
                    label={`Move ${loadout.name} up`}
                    disabled={pending || index === 0}
                    onClick={() => save(moveLoadout(loadouts, loadout.id, -1))}
                  >
                    <ArrowUp size={14} />
                  </IconButton>
                  <IconButton
                    label={`Move ${loadout.name} down`}
                    disabled={pending || index === loadouts.length - 1}
                    onClick={() => save(moveLoadout(loadouts, loadout.id, 1))}
                  >
                    <ArrowDown size={14} />
                  </IconButton>
                  <IconButton
                    label={`Delete ${loadout.name}`}
                    disabled={pending}
                    onClick={() => {
                      setRemoved({ name: loadout.name, before: loadouts })
                      save(loadouts.filter((entry) => entry.id !== loadout.id))
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {removed !== null && (
        <p
          role="status"
          className="flex items-center gap-[8px] [margin:10px_0_0] text-[11.5px] text-[var(--text-secondary)]"
        >
          Deleted “{removed.name}”.
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              save(removed.before)
              setRemoved(null)
            }}
          >
            Undo
          </Button>
        </p>
      )}
    </section>
  )
}
