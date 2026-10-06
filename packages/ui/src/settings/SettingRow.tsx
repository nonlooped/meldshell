import type { ReactNode } from "react"
import { Field } from "@base-ui-components/react/field"
import { cx } from "../ui/styles"

/** One setting in a card: what it is and what it does on the left, its control on the right. */
export function SettingRow({
  label,
  description,
  controlId,
  stacked = false,
  children,
}: {
  readonly label: string
  readonly description?: ReactNode
  readonly controlId?: string
  /**
   * Puts a wide control, such as a row of preview tiles, beneath the label instead of beside it.
   * The row is then not a field: a field would name each of a group's options after its label, so
   * the group labels itself.
   */
  readonly stacked?: boolean
  readonly children?: ReactNode
}): React.JSX.Element {
  if (stacked)
    return (
      <div
        data-setting-label={label}
        tabIndex={-1}
        className={cx(rowClasses, "flex-col gap-[14px]")}
      >
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className={labelClasses}>{label}</span>
          {description !== undefined && <p className={descriptionClasses}>{description}</p>}
        </div>
        {children}
      </div>
    )
  return (
    <Field.Root
      data-setting-label={label}
      tabIndex={-1}
      className={cx(
        rowClasses,
        "items-center gap-[32px] [@container(max-width:_540px)]:items-start [@container(max-width:_540px)]:flex-col [@container(max-width:_540px)]:gap-[12px]",
        // A lone switch stays beside its label, as a phone's own settings keep it. Base UI renders a
        // hidden checkbox beside the switch, so a lone switch is a control with two children.
        "[@container(max-width:_540px)]:[&:has(>_.setting-control_>_.switch):not(:has(>_.setting-control_>_:nth-child(3)))]:flex-row",
        "[@container(max-width:_540px)]:[&:has(>_.setting-control_>_.switch):not(:has(>_.setting-control_>_:nth-child(3)))]:gap-[16px]",
      )}
    >
      <div className="flex min-w-0 flex-col gap-[3px]">
        <Field.Label className={labelClasses} htmlFor={controlId}>
          {label}
        </Field.Label>
        {description !== undefined && (
          <Field.Description className={descriptionClasses}>{description}</Field.Description>
        )}
      </div>
      {children !== undefined && <div className={settingControlClasses}>{children}</div>}
    </Field.Root>
  )
}

/** Rows sit in a card, so they carry its inner padding. */
export const settingRowPadding = "[padding:14px_16px]"

const rowClasses = cx(
  "setting-row flex min-h-[62px] justify-between outline-none",
  settingRowPadding,
  "first:rounded-t-[inherit] last:rounded-b-[inherit]",
)
const labelClasses = "setting-label text-[var(--text-primary)] text-[13px] font-medium"
const descriptionClasses = "m-0 text-[var(--text-secondary)] text-[12px] leading-[1.6]"

const settingControlClasses = [
  // Fields and selects take the full column; a lone switch or button hugs its own width.
  "setting-control flex min-w-[220px] max-w-[320px] flex-none justify-end [&_>_.text-input]:w-full [&_>_.text-input]:min-w-0",
  "[&_>_.field]:w-full [&_>_.field]:min-w-0 [&_>_.button]:w-full [&_>_.button]:min-w-0",
  "[&_.button]:min-h-[32px] [&_.switch]:shrink-0 [@container(max-width:_540px)]:w-[min(100%,_220px)]",
  "[@container(max-width:_540px)]:basis-[auto] [@container(max-width:_540px)]:justify-start",
  "[@container(max-width:_540px)]:[&:has(>_.switch):not(:has(>_:nth-child(3)))]:w-auto",
  "[@container(max-width:_540px)]:[&:has(>_.switch):not(:has(>_:nth-child(3)))]:min-w-0",
  "[@container(max-width:_540px)]:[&:has(>_.switch):not(:has(>_:nth-child(3)))]:pt-[2px]",
].join(" ")
