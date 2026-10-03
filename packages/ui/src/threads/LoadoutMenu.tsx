import { useState } from "react"
import { Button as BaseButton } from "@base-ui-components/react/button"
import type { AppSnapshot, Loadout, SetThreadSettingsInput } from "@meldshell/contracts"
import { ChevronDown, Layers, Plus, Settings2 } from "lucide-react"
import type { Selection } from "../data/catalog"
import { useAppSettingsMutation } from "../data/mutations"
import { LOADOUT_ACTIONS, useKeybindings } from "../app/keybindings"
import { useViewStore } from "../app/view-store"
import { Pressable, TextSwap } from "../ui/motion"
import { chipClasses } from "../ui/styles"
import {
  AppDialog,
  Button,
  ChordKeys,
  DropdownMenu,
  MenuAction,
  MenuChoice,
  MenuGroup,
  MenuRadioGroup,
  MenuSeparator,
  TextField,
} from "../ui/controls"
import {
  activeLoadout,
  canAddLoadout,
  describeSelection,
  loadoutFromSelection,
  loadoutSelection,
  loadoutSettings,
  suggestedLoadoutName,
} from "./loadout-model"

/** The composer's loadout chip: switch to a saved setup, or save the current one. */
export function LoadoutMenu({
  snapshot,
  threadId,
  selection,
  onChangeSettings,
}: {
  readonly snapshot: AppSnapshot
  readonly threadId: string
  readonly selection: Selection
  readonly onChangeSettings: (input: SetThreadSettingsInput) => void
}): React.JSX.Element {
  const loadouts = snapshot.settings.loadouts ?? []
  const fullPermissions = snapshot.settings.alwaysFullPermissions ?? false
  const bindings = useKeybindings((state) => state.bindings)
  const [saving, setSaving] = useState(false)
  const active = activeLoadout(loadouts, selection)
  const chordFor = (index: number): string => {
    const action = LOADOUT_ACTIONS[index]
    return action === undefined ? "" : bindings[action]
  }
  const nextChord = chordFor(loadouts.length)

  return (
    <>
      <DropdownMenu
        side="top"
        trigger={
          <BaseButton
            render={<Pressable />}
            type="button"
            className={`motion-colors ${chipClasses}`}
            data-active={active !== undefined}
            aria-label={active === undefined ? "Loadouts" : `Loadout: ${active.name}`}
            title={active === undefined ? "Loadouts" : undefined}
          >
            <Layers size={13} strokeWidth={1.75} className="flex-none" />
            {active !== undefined && (
              <span className="chip-label min-w-0 max-w-[140px]">
                <TextSwap text={active.name} />
              </span>
            )}
            <ChevronDown
              size={13}
              strokeWidth={1.75}
              className="chip-chevron flex-none text-[var(--text-tertiary)]"
            />
          </BaseButton>
        }
        className="min-w-[280px]"
      >
        <MenuGroup label="Loadouts">
          {loadouts.length === 0 && (
            <p className="max-w-[300px] [margin:0_9px_6px] text-[11.5px] leading-[1.45] text-[var(--text-secondary)]">
              Save this agent, model, effort, and permission setup, then switch back to it in one
              step{nextChord === "" ? "" : ` with ${nextChord}`}.
            </p>
          )}
          <MenuRadioGroup
            value={active?.id ?? ""}
            onValueChange={(value) => {
              const loadout = loadouts.find((entry) => entry.id === value)
              if (loadout !== undefined) onChangeSettings(loadoutSettings(loadout, threadId))
            }}
          >
            {loadouts.map((loadout, index) => {
              const saved = loadoutSelection(snapshot, loadout)
              const chord = chordFor(index)
              return (
                <MenuChoice
                  key={loadout.id}
                  value={loadout.id}
                  disabled={saved === null}
                  hint={
                    saved === null
                      ? "Its model is turned off or removed"
                      : describeSelection(saved, fullPermissions)
                  }
                  detail={chord === "" ? undefined : chord}
                >
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {loadout.name}
                  </span>
                </MenuChoice>
              )
            })}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        {active === undefined && (
          <MenuAction
            icon={<Plus size={14} strokeWidth={1.75} />}
            disabled={!canAddLoadout(loadouts)}
            onClick={() => setSaving(true)}
          >
            {canAddLoadout(loadouts) ? "Save current setup…" : "All five loadouts are in use"}
          </MenuAction>
        )}
        <MenuAction
          icon={<Settings2 size={14} strokeWidth={1.75} />}
          onClick={() => useViewStore.getState().openSettings("loadouts")}
        >
          Manage loadouts…
        </MenuAction>
      </DropdownMenu>
      {saving && (
        <SaveLoadoutDialog
          loadouts={loadouts}
          selection={selection}
          summary={describeSelection(selection, fullPermissions)}
          chord={nextChord}
          onClose={() => setSaving(false)}
        />
      )}
    </>
  )
}

function SaveLoadoutDialog({
  loadouts,
  selection,
  summary,
  chord,
  onClose,
}: {
  readonly loadouts: ReadonlyArray<Loadout>
  readonly selection: Selection
  readonly summary: string
  readonly chord: string
  readonly onClose: () => void
}): React.JSX.Element {
  const [name, setName] = useState(() => suggestedLoadoutName(loadouts, selection))
  const mutation = useAppSettingsMutation()
  const save = () => {
    if (name.trim() === "" || mutation.isPending) return
    const loadout = loadoutFromSelection(selection, name, crypto.randomUUID())
    mutation.mutate({ loadouts: [...loadouts, loadout] }, { onSuccess: onClose })
  }
  return (
    <AppDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Save loadout"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={name.trim() === "" || mutation.isPending}
            onClick={save}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-[12px] [padding:14px_20px_0]"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <TextField
          label="Name"
          value={name}
          maxLength={48}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onValueChange={setName}
        />
        <div className="flex flex-col gap-[6px] [padding:10px_12px] rounded-[var(--radius)] bg-[var(--surface-hover)] text-[12px] leading-[1.5]">
          <span className="text-[var(--text-primary)]">{summary}</span>
          {chord !== "" && (
            <span className="flex items-center gap-[6px] text-[var(--text-secondary)]">
              Switch to it with <ChordKeys chord={chord} />
            </span>
          )}
        </div>
        {mutation.error && (
          <p role="alert" className="m-0 text-[11.5px] text-[var(--color-deleted)]">
            {mutation.error.message}
          </p>
        )}
      </form>
    </AppDialog>
  )
}
