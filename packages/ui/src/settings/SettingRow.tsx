import type { ReactNode } from "react"
import { Field } from "@base-ui-components/react/field"
import { cx } from "../ui/styles"

export function SettingRow({
  label,
  description,
  controlId,
  stacked = false,
  children,
}: {
  readonly label: string
  readonly description: ReactNode
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
        <div className="flex min-w-0 flex-col gap-[4px]">
          <span className={labelClasses}>{label}</span>
          <p className={descriptionClasses}>{description}</p>
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
      )}
    >
      <div className="flex min-w-0 flex-col gap-[4px]">
        <Field.Label className={labelClasses} htmlFor={controlId}>
          {label}
        </Field.Label>
        <Field.Description className={descriptionClasses}>{description}</Field.Description>
      </div>
      {children !== undefined && <div className={settingControlClasses}>{children}</div>}
    </Field.Root>
  )
}

const rowClasses =
  "setting-row flex min-h-[76px] justify-between [padding:18px_0] [&_+_.setting-row]:border-t-[1px] [&_+_.setting-row]:border-t-[color:var(--line-subtle)]"
const labelClasses = "setting-label text-[var(--text-primary)] text-[13px] font-medium"
const descriptionClasses = "m-0 text-[var(--text-secondary)] text-[12px] leading-[1.6]"

const settingControlClasses = [
  "flex w-[220px] flex-[0_0_220px] justify-end [&_>_.text-input]:w-full [&_>_.text-input]:min-w-0",
  "[&_>_.field]:w-full [&_>_.field]:min-w-0 [&_>_.button]:w-full [&_>_.button]:min-w-0",
  "[&_.button]:min-h-[34px] [&_.switch]:shrink-0 [@container(max-width:_540px)]:w-[min(100%,_220px)]",
  "[@container(max-width:_540px)]:basis-[auto] [@container(max-width:_540px)]:justify-start",
].join(" ")
