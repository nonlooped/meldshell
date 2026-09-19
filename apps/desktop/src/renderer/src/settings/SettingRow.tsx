import type { ReactNode } from "react"
import { Field } from "@base-ui-components/react/field"

export function SettingRow({
  label,
  description,
  controlId,
  children,
}: {
  readonly label: string
  readonly description: string
  readonly controlId?: string
  readonly children: ReactNode
}): React.JSX.Element {
  return (
    <Field.Root className="setting-row">
      <div className="setting-copy">
        <Field.Label className="setting-label" htmlFor={controlId}>
          {label}
        </Field.Label>
        <Field.Description className="setting-description">{description}</Field.Description>
      </div>
      <div className="setting-control">{children}</div>
    </Field.Root>
  )
}
