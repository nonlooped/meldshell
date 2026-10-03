import { useState } from "react"
import type {
  AppSnapshot,
  Loadout,
  ProviderModel,
  SetThreadSettingsInput,
} from "@meldshell/contracts"
import { Plus, Settings2 } from "lucide-react"
import type { Selection } from "../data/catalog"
import { useAppSettingsMutation } from "../data/mutations"
import { LOADOUT_ACTIONS, useKeybindings } from "../app/keybindings"
import { useViewStore } from "../app/view-store"
import { AppDialog, Button, ChordKeys, TextField } from "../ui/controls"
import { cx } from "../ui/styles"
import { ModelPicker } from "./ModelPicker"
import {
  activeLoadout,
  canAddLoadout,
  describeLoadout,
  type LoadoutChoice,
  loadoutFromSelection,
  loadoutSelection,
  loadoutSettings,
  suggestedLoadoutName,
} from "./loadout-model"

/**
 * The composer's model picker with the saved loadouts along its foot, so switching a whole setup
 * sits beside switching a model instead of taking another chip in the toolbar.
 */
export function ModelPickerWithLoadouts({
  snapshot,
  threadId,
  selection,
  models,
  onChangeSettings,
}: {
  readonly snapshot: AppSnapshot
  readonly threadId: string
  readonly selection: Selection
  readonly models: ReadonlyArray<ProviderModel>
  readonly onChangeSettings: (input: SetThreadSettingsInput) => void
}): React.JSX.Element {
  const loadouts = snapshot.settings.loadouts ?? []
  const bindings = useKeybindings((state) => state.bindings)
  const [saving, setSaving] = useState(false)
  const chordFor = (index: number): string => {
    const action = LOADOUT_ACTIONS[index]
    return action === undefined ? "" : bindings[action]
  }
  return (
    <>
      <ModelPicker
        providers={snapshot.providers}
        models={models}
        selected={selection.model}
        onSelect={(modelId) => onChangeSettings({ threadId, modelId })}
        footer={(close) => (
          <LoadoutStrip
            snapshot={snapshot}
            loadouts={loadouts}
            selection={selection}
            chordFor={chordFor}
            onApply={(loadout) => {
              onChangeSettings(loadoutSettings(loadout, threadId))
              close()
            }}
            onSave={() => {
              close()
              setSaving(true)
            }}
            onManage={() => {
              close()
              useViewStore.getState().openSettings("threads")
            }}
          />
        )}
      />
      {saving && (
        <SaveLoadoutDialog
          loadouts={loadouts}
          selection={selection}
          chord={chordFor(loadouts.length)}
          onClose={() => setSaving(false)}
        />
      )}
    </>
  )
}

function LoadoutStrip({
  snapshot,
  loadouts,
  selection,
  chordFor,
  onApply,
  onSave,
  onManage,
}: {
  readonly snapshot: AppSnapshot
  readonly loadouts: ReadonlyArray<Loadout>
  readonly selection: Selection
  readonly chordFor: (index: number) => string
  readonly onApply: (loadout: Loadout) => void
  readonly onSave: () => void
  readonly onManage: () => void
}): React.JSX.Element {
  const active = activeLoadout(loadouts, selection)
  const canSave = active === undefined && canAddLoadout(loadouts)
  return (
    <section
      aria-label="Loadouts"
      className="shrink-0 flex flex-col gap-[7px] [padding:9px_10px_10px] border-t-[1px] border-t-[color:var(--line-subtle)]"
    >
      <div className="flex items-center justify-between [padding:0_2px] text-[var(--text-tertiary)] text-[11px] font-medium">
        Loadouts
        <button
          type="button"
          className={iconClasses}
          aria-label="Manage loadouts"
          title="Manage loadouts"
          onClick={onManage}
        >
          <Settings2 size={13} strokeWidth={1.75} />
        </button>
      </div>
      {loadouts.length === 0 && (
        <p className="m-0 [padding:0_2px] text-[11px] leading-[1.45] text-[var(--text-secondary)]">
          Save this model and effort to switch back to them in one step
          {chordFor(0) === "" ? "" : ` with ${chordFor(0)}`}.
        </p>
      )}
      <div className="flex flex-wrap gap-[5px]">
        {loadouts.map((loadout, index) => {
          const saved = loadoutSelection(snapshot, loadout)
          const chord = chordFor(index)
          return (
            <button
              key={loadout.id}
              type="button"
              className={pillClasses}
              data-active={loadout.id === active?.id}
              disabled={saved === null}
              title={saved === null ? "Its model is turned off or removed" : describeLoadout(saved)}
              onClick={() => onApply(loadout)}
            >
              <span className="min-w-0 overflow-hidden text-ellipsis">{loadout.name}</span>
              {chord !== "" && (
                <span className="flex-none text-[var(--text-tertiary)] [font-family:var(--font-mono)] text-[10px]">
                  {chord}
                </span>
              )}
            </button>
          )
        })}
        {canSave && (
          <button
            type="button"
            className={cx(pillClasses, "border-dashed text-[var(--text-tertiary)]")}
            onClick={onSave}
          >
            <Plus size={12} strokeWidth={2} className="flex-none" />
            Save current
          </button>
        )}
      </div>
    </section>
  )
}

function SaveLoadoutDialog({
  loadouts,
  selection,
  chord,
  onClose,
}: {
  readonly loadouts: ReadonlyArray<Loadout>
  readonly selection: LoadoutChoice
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
          <span className="text-[var(--text-primary)]">{describeLoadout(selection)}</span>
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

const pillClasses = [
  "motion-colors inline-flex max-w-full items-center gap-[6px] h-[24px] [padding:0_8px]",
  "border-[1px] border-[color:var(--line)] rounded-full bg-transparent cursor-default",
  "text-[var(--text-secondary)] text-[11.5px] whitespace-nowrap",
  "[&:hover:not(:disabled)]:bg-[var(--surface-hover)] [&:hover:not(:disabled)]:text-[var(--text-primary)]",
  "[&[data-active='true']]:bg-[var(--surface-active)] [&[data-active='true']]:text-[var(--text-primary)]",
  "[&[data-active='true']]:[border-color:var(--line-strong)] [&:disabled]:opacity-[0.5]",
  "[&:focus-visible]:[outline:1px_solid_var(--focus-ring)]",
].join(" ")

const iconClasses = [
  "motion-colors grid w-[20px] h-[20px] place-items-center p-0 border-0 rounded-[var(--radius-sm)]",
  "bg-transparent text-[var(--text-tertiary)] cursor-default",
  "[&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]",
].join(" ")
