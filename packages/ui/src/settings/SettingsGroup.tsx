import { useId, type ReactNode } from "react"

/**
 * A raised list of settings. Its direct children are rows, divided by hairlines; a child that
 * renders nothing leaves no gap, and a card with no rows hides its whole group.
 */
export const settingsCardClasses = [
  "settings-card border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)]",
  "bg-[var(--surface-card)] [&>*+*]:border-t-[1px] [&>*+*]:border-t-[color:var(--line-subtle)]",
].join(" ")

/** The same surface for a card that divides its own content, such as a provider. */
export const settingsCardSurfaceClasses =
  "border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] bg-[var(--surface-card)]"

/** A small caption above one of several cards in a group, such as a shortcut category. */
export const settingsCaptionClasses =
  "m-0 [padding:0_2px_8px] text-[var(--text-tertiary)] text-[12px] font-medium"

/**
 * One titled part of a settings page. The page's outline and search both find groups by
 * `data-settings-group`, so a group is reachable from the sidebar and from results alike.
 */
export function SettingsGroup({
  title,
  description,
  action,
  bare = false,
  children,
}: {
  readonly title: string
  readonly description?: ReactNode
  /** A control that acts on the whole group, beside its title. */
  readonly action?: ReactNode
  /** Leaves the children to draw their own cards. */
  readonly bare?: boolean
  readonly children: ReactNode
}): React.JSX.Element {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      data-settings-group={title}
      data-setting-label={title}
      tabIndex={-1}
      className="mb-[36px] last:mb-0 scroll-mt-[20px] outline-none rounded-[var(--radius-lg)] has-[>.settings-card:empty]:hidden"
    >
      <header
        className={`flex items-start justify-between gap-[16px] [padding:0_2px] ${bare ? "mb-[14px]" : "mb-[10px]"}`}
      >
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h3
            id={id}
            className="m-0 [font-family:var(--font-display)] text-[var(--text-primary)] text-[14px] font-semibold tracking-[-0.005em]"
          >
            {title}
          </h3>
          {description !== undefined && (
            <p className="m-0 max-w-[600px] text-[var(--text-secondary)] text-[12px] leading-[1.6]">
              {description}
            </p>
          )}
        </div>
        {action !== undefined && (
          <div className="flex flex-none items-center -mt-[3px]">{action}</div>
        )}
      </header>
      {bare ? children : <div className={settingsCardClasses}>{children}</div>}
    </section>
  )
}
