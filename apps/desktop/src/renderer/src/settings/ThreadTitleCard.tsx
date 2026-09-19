import { Button as BaseButton } from "@base-ui-components/react/button"
import { modelLabel } from "../data/model-label"
import type { AppSnapshot } from "@meldshell/contracts"
import { CURRENT_TITLE_MODEL } from "@meldshell/contracts"
import { ChevronDown } from "lucide-react"
import { SettingRow } from "./SettingRow"
import { selectableModels } from "../data/catalog"
import { ProviderIcon } from "../ui/ProviderIcon"
import { DropdownMenu, MenuChoice, MenuGroup, MenuRadioGroup, MenuSeparator } from "../ui/controls"

interface ThreadTitleCardProps {
  readonly pending: boolean
  readonly snapshot: AppSnapshot
  readonly onChangeTitleModel: (titleModelId: string) => void
}

const CURRENT_MODEL_LABEL = "Current model"

export function ThreadTitleCard({
  snapshot,
  pending,
  onChangeTitleModel,
}: ThreadTitleCardProps): React.JSX.Element {
  const available = selectableModels(snapshot)
  const providerById = new Map(snapshot.providers.map((provider) => [provider.id, provider]))
  const configured = snapshot.settings.titleModelId
  const chosen = available.find((model) => model.id === configured)
  // Show the active fallback without overwriting an unavailable model preference.
  const label = chosen ? modelLabel(chosen.displayName) : CURRENT_MODEL_LABEL

  return (
    <section className="settings-group" aria-label="Thread preferences">
      <SettingRow
        label="Title model"
        description="Follow each thread's active model, or choose one model for every title."
      >
        <DropdownMenu
          align="end"
          trigger={
            <BaseButton
              type="button"
              disabled={pending}
              className="button"
              data-block="true"
              aria-label="Change the model that names threads"
              style={{ justifyContent: "space-between" }}
            >
              {label}
              <ChevronDown size={13} strokeWidth={1.75} className="chip-chevron" />
            </BaseButton>
          }
        >
          <MenuRadioGroup
            value={chosen?.id ?? CURRENT_TITLE_MODEL}
            onValueChange={(value) => onChangeTitleModel(String(value))}
          >
            <MenuGroup label="Follow the thread">
              <MenuChoice value={CURRENT_TITLE_MODEL} className="model-item">
                <span className="model-item-body">
                  <span className="model-item-name">{CURRENT_MODEL_LABEL}</span>
                  <span className="model-item-slug">The model selected for this thread</span>
                </span>
              </MenuChoice>
            </MenuGroup>

            {available.length > 0 && <MenuSeparator />}

            {available.length > 0 && (
              <MenuGroup label="Always use">
                {available.map((model) => (
                  <MenuChoice key={model.id} value={model.id} className="model-item">
                    <span className="model-item-body">
                      <span className="model-item-name">{modelLabel(model.displayName)}</span>
                      <span className="model-item-provider">
                        <ProviderIcon provider={providerById.get(model.providerId)} size={12} />
                        {providerById.get(model.providerId)?.harness === "codex"
                          ? "Codex"
                          : providerById.get(model.providerId)?.displayName}
                      </span>
                    </span>
                  </MenuChoice>
                ))}
              </MenuGroup>
            )}
          </MenuRadioGroup>
        </DropdownMenu>
      </SettingRow>
    </section>
  )
}
