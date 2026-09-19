import { chipClasses } from "../ui/styles"
import { MotionSurface } from "../ui/motion"
import { useRef, useState } from "react"
import { Combobox } from "@base-ui-components/react/combobox"
import type { Provider, ProviderModel } from "@meldshell/contracts"
import { Check, ChevronDown, Search } from "lucide-react"
import { modelLabel } from "../data/model-label"
import { ProviderIcon } from "../ui/ProviderIcon"

export function ModelPicker({
  providers,
  models,
  selected,
  onSelect,
}: {
  readonly providers: ReadonlyArray<Provider>
  readonly models: ReadonlyArray<ProviderModel>
  readonly selected: ProviderModel
  readonly onSelect: (id: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const enabled = providers.filter((provider) => provider.enabled)
  const groups = enabled.map((provider) => ({
    provider,
    items: models.filter((model) => model.providerId === provider.id),
  }))
  const label = (model: ProviderModel): string => modelLabel(model.displayName)
  return (
    <Combobox.Root<ProviderModel>
      items={groups}
      value={selected}
      isItemEqualToValue={(model, value) => model.id === value.id}
      itemToStringLabel={label}
      inputValue={search}
      onInputValueChange={setSearch}
      autoHighlight
      filter={(model, query) =>
        `${modelLabel(model.displayName)} ${model.displayName} ${model.slug} ${providers.find((provider) => provider.id === model.providerId)?.displayName ?? ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      }
      onValueChange={(model) => {
        if (model !== null) onSelect(model.id)
      }}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setSearch("")
        }
      }}
    >
      <Combobox.Trigger
        data-motion="background-color border-color color opacity"
        className={chipClasses}
        aria-label="Change model"
        title={label(selected)}
      >
        <ProviderIcon
          provider={providers.find((provider) => provider.id === selected.providerId)}
          size={13}
        />
        <span className="overflow-hidden text-ellipsis">{label(selected)}</span>
        <ChevronDown
          size={13}
          strokeWidth={1.75}
          className="flex-none text-[var(--text-tertiary)]"
        />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          className="z-[200]"
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={10}
        >
          <Combobox.Popup
            render={<MotionSurface kind="popup" />}
            className={popupClasses}
            aria-label="Choose a model"
            initialFocus={searchRef}
          >
            <div className="flex flex-col min-h-0 min-w-0">
              <label className={modelPickerSearchClasses}>
                <Search size={14} aria-hidden="true" />
                <Combobox.Input
                  ref={searchRef}
                  placeholder="Search models…"
                  aria-label="Search models"
                />
              </label>
              <Combobox.List
                className="overflow-y-auto min-h-0 [padding:4px_6px_8px] [scroll-padding:6px] overflow-y-auto [scrollbar-gutter:stable]"
                aria-label="Models"
              >
                {(group: (typeof groups)[number]) => (
                  <Combobox.Group
                    className="model-picker-group [&_+_.model-picker-group]:mt-[8px] [&_+_.model-picker-group]:pt-[8px] [&_+_.model-picker-group]:border-t-[1px] [&_+_.model-picker-group]:border-t-[color:var(--line)]"
                    items={group.items}
                    key={group.provider.id}
                  >
                    <Combobox.GroupLabel className="flex items-center gap-[7px] [padding:8px_8px_6px] text-[var(--text-secondary)] text-[11px] font-semibold">
                      <ProviderIcon provider={group.provider} size={14} />
                      <span>{group.provider.displayName}</span>
                      {group.provider.harness === "codex" && (
                        <span className="ml-[auto] text-[var(--text-tertiary)] text-[10px]">
                          Codex
                        </span>
                      )}
                    </Combobox.GroupLabel>
                    <Combobox.Collection>
                      {(model: ProviderModel) => (
                        <Combobox.Item
                          className={modelPickerOptionClasses}
                          key={model.id}
                          value={model}
                          title={label(model)}
                        >
                          <span className="model-item-name text-inherit text-[12.5px]">
                            {label(model)}
                          </span>
                          <Combobox.ItemIndicator className="flex shrink-0">
                            <Check size={13} aria-hidden="true" />
                          </Combobox.ItemIndicator>
                        </Combobox.Item>
                      )}
                    </Combobox.Collection>
                  </Combobox.Group>
                )}
              </Combobox.List>
              <Combobox.Empty className="[margin:8px_12px] text-[11px] text-[var(--text-secondary)]">
                {search ? "No matching models." : "Enable a model in Settings > Providers."}
              </Combobox.Empty>
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}

const popupClasses = [
  "popup min-w-[190px] max-h-[var(--available-height,_420px)] overflow-y-auto p-[5px]",
  "border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] bg-[var(--surface-menu)]",
  "[backdrop-filter:blur(32px)]",
  "[box-shadow:0_4px_16px_rgba(0,_0,_0,_0.16),_inset_0_1px_0_var(--line-subtle)]",
  "text-[var(--text-primary)] outline-none [transform-origin:var(--transform-origin)]",
  "[@media(prefers-reduced-transparency:_reduce)]:[backdrop-filter:none]",
  "[@media(prefers-reduced-transparency:_reduce)]:bg-[var(--surface-overlay)] [&.popup]:flex",
  "[&.popup]:flex-col [&.popup]:w-[min(320px,_var(--available-width))]",
  "[&.popup]:max-h-[min(400px,_var(--available-height))] [&.popup]:p-0 [&.popup]:overflow-hidden",
].join(" ")

const modelPickerSearchClasses = [
  "flex items-center shrink-0 gap-[8px] m-[10px] [padding:8px_10px] border-[1px] border-[color:var(--line)]",
  "rounded-[var(--radius-sm)] bg-[var(--surface-hover)] text-[var(--text-secondary)] [&_input]:min-w-0",
  "[&_input]:w-full [&_input]:border-0 [&_input]:outline-none [&_input]:bg-transparent",
  "[&_input]:text-[var(--text-primary)] [&_input]:[font:inherit] [&_input]:text-[12px]",
  "[&:focus-within]:[border-color:var(--text-secondary)]",
].join(" ")

const modelPickerOptionClasses = [
  "flex items-center justify-between gap-[12px] w-full min-h-[33px] [padding:7px_10px_7px_29px]",
  "border-0 rounded-[var(--radius-sm)] bg-transparent text-[var(--text-secondary)] cursor-default",
  "text-left [&[data-selected]]:bg-[var(--surface-active)] [&[data-selected]]:text-[var(--text-primary)]",
  "[&_.model-item-name]:min-w-0 [&_.model-item-name]:[overflow-wrap:anywhere]",
  "[&:hover]:bg-[var(--surface-hover)] [&[data-highlighted]]:bg-[var(--surface-hover)]",
  "[&[data-highlighted]]:[outline:1px_solid_var(--accent)] [&[data-highlighted]]:[outline-offset:-1px]",
  "[&:focus-visible]:[outline:1px_solid_var(--accent)] [&:focus-visible]:[outline-offset:-1px]",
].join(" ")
