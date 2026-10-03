import type { ReactNode } from "react"

export function SettingsGroup({
  title,
  children,
}: {
  readonly title: string
  readonly children: ReactNode
}): React.JSX.Element {
  return (
    <section aria-label={title} data-setting-label={title} tabIndex={-1} className="mb-[28px]">
      <h3 className="m-0 mb-[12px] text-[13px] font-semibold text-[var(--text-primary)]">
        {title}
      </h3>
      {children}
    </section>
  )
}
