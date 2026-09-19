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
      <Combobox.Trigger className="chip" aria-label="Change model" title={label(selected)}>
        <ProviderIcon
          provider={providers.find((provider) => provider.id === selected.providerId)}
          size={13}
        />
        <span className="chip-label">{label(selected)}</span>
        <ChevronDown size={13} strokeWidth={1.75} className="chip-chevron" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          className="popup-positioner"
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={10}
        >
          <Combobox.Popup
            className="popup model-picker"
            aria-label="Choose a model"
            initialFocus={searchRef}
          >
            <div className="model-picker-content">
              <label className="model-picker-search">
                <Search size={14} aria-hidden="true" />
                <Combobox.Input
                  ref={searchRef}
                  placeholder="Search models…"
                  aria-label="Search models"
                />
              </label>
              <Combobox.List className="model-picker-list scrollable" aria-label="Models">
                {(group: (typeof groups)[number]) => (
                  <Combobox.Group
                    className="model-picker-group"
                    items={group.items}
                    key={group.provider.id}
                  >
                    <Combobox.GroupLabel className="model-picker-group-heading">
                      <ProviderIcon provider={group.provider} size={14} />
                      <span>{group.provider.displayName}</span>
                      {group.provider.harness === "codex" && (
                        <span className="model-picker-harness">Codex</span>
                      )}
                    </Combobox.GroupLabel>
                    <Combobox.Collection>
                      {(model: ProviderModel) => (
                        <Combobox.Item
                          className="model-picker-option"
                          key={model.id}
                          value={model}
                          title={label(model)}
                        >
                          <span className="model-item-name">{label(model)}</span>
                          <Combobox.ItemIndicator className="model-picker-check">
                            <Check size={13} aria-hidden="true" />
                          </Combobox.ItemIndicator>
                        </Combobox.Item>
                      )}
                    </Combobox.Collection>
                  </Combobox.Group>
                )}
              </Combobox.List>
              <Combobox.Empty className="model-picker-empty">
                {search ? "No matching models." : "Enable a model in Settings > Providers."}
              </Combobox.Empty>
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
