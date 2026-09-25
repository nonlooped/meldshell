import type { ReactNode } from "react"
import { Field } from "@base-ui-components/react/field"

export function SettingRow({
  label,
  description,
  controlId,
  children,
}: {
  readonly label: string
  readonly description: ReactNode
  readonly controlId?: string
  readonly children?: ReactNode
}): React.JSX.Element {
  return (
    <Field.Root className="setting-row flex min-h-[76px] items-center justify-between gap-[32px] [padding:18px_0] [&_+_.setting-row]:border-t-[1px] [&_+_.setting-row]:border-t-[color:var(--line-subtle)] [@container(max-width:_540px)]:items-start [@container(max-width:_540px)]:flex-col [@container(max-width:_540px)]:gap-[12px]">
      <div className="flex min-w-0 flex-col gap-[4px]">
        <Field.Label
          className="setting-label text-[var(--text-primary)] text-[13px] font-medium"
          htmlFor={controlId}
        >
          {label}
        </Field.Label>
        <Field.Description className="m-0 text-[var(--text-secondary)] text-[12px] leading-[1.6]">
          {description}
        </Field.Description>
      </div>
      {children !== undefined && <div className={settingControlClasses}>{children}</div>}
    </Field.Root>
  )
}

const settingControlClasses = [
  "flex w-[220px] flex-[0_0_220px] justify-end [&_>_.text-input]:w-full [&_>_.text-input]:min-w-0",
  "[&_>_.field]:w-full [&_>_.field]:min-w-0 [&_>_.button]:w-full [&_>_.button]:min-w-0",
  "[&_.button]:min-h-[34px] [&_.switch]:shrink-0 [@container(max-width:_540px)]:w-[min(100%,_220px)]",
  "[@container(max-width:_540px)]:basis-[auto] [@container(max-width:_540px)]:justify-start",
].join(" ")
