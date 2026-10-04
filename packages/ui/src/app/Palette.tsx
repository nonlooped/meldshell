import { Combobox } from "@base-ui-components/react/combobox"
import { Dialog } from "@base-ui-components/react/dialog"
import { Search } from "lucide-react"
import { useEffect, useState } from "react"
import { MotionSurface } from "../ui/motion"
import { ContextMenu } from "../ui/controls"

/** Results follow typing after a pause, so a burst of keys runs one search instead of one per key. */
const DEBOUNCE_MS = 120

/** The trimmed query after typing pauses; clearing the input applies at once. */
export function useDebouncedQuery(query: string): string {
  const [debounced, setDebounced] = useState(() => query.trim())
  useEffect(() => {
    const next = query.trim()
    if (next === "") {
      setDebounced(next)
      return
    }
    const timer = setTimeout(() => setDebounced(next), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])
  return debounced
}

/** Top-anchored quick-open surface. Its body mounts only while open, so closed palettes cost nothing. */
export function Palette({
  open,
  onOpenChange,
  title,
  children,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop
          render={<MotionSurface kind="backdrop" />}
          className="fixed z-[100] [inset:0] bg-[var(--backdrop-light)]"
        />
        <Dialog.Popup render={<MotionSurface kind="popup" />} className={popupClasses}>
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function PaletteSearch<Item>({
  items,
  query,
  onQueryChange,
  placeholder,
  itemKey,
  itemLabel,
  onPick,
  renderItem,
  contextActions,
  notice,
}: {
  readonly items: readonly Item[]
  readonly query: string
  readonly onQueryChange: (query: string) => void
  readonly placeholder: string
  readonly itemKey: (item: Item) => string
  readonly itemLabel: (item: Item) => string
  readonly onPick: (item: Item) => void
  readonly renderItem: (item: Item) => React.ReactNode
  readonly contextActions?: (item: Item) => React.ReactNode
  /** Shown under the input instead of results, such as why there are none. */
  readonly notice?: React.ReactNode
}): React.JSX.Element {
  return (
    <Combobox.Root<Item>
      inline
      defaultOpen
      autoHighlight
      items={items}
      filter={null}
      inputValue={query}
      onInputValueChange={onQueryChange}
      itemToStringLabel={itemLabel}
      isItemEqualToValue={(item, value) => itemKey(item) === itemKey(value)}
      onValueChange={(item) => {
        if (item !== null) onPick(item)
      }}
    >
      <div className="flex items-center gap-[10px] h-[44px] [padding:0_14px] text-[var(--text-tertiary)]">
        <Search size={15} aria-hidden="true" className="flex-none" />
        <Combobox.Input
          className="min-w-0 flex-1 h-full p-0 border-0 bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          autoFocus
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </div>
      {notice !== undefined && notice !== null && (
        <div
          role="status"
          className="flex items-center gap-[8px] min-h-[40px] [padding:10px_16px] border-t-[1px] border-t-[color:var(--line-subtle)] text-[13px] leading-[1.5] text-[var(--text-tertiary)]"
        >
          {notice}
        </div>
      )}
      {items.length > 0 && (
        <Combobox.List
          className="flex max-h-[min(360px,_calc(var(--viewport-h)_*_0.6))] flex-col gap-[1px] overflow-y-auto p-[6px] border-t-[1px] border-t-[color:var(--line-subtle)]"
          aria-label="Results"
        >
          {(item: Item) => {
            const row = (
              <Combobox.Item className={itemClasses} key={itemKey(item)} value={item}>
                {renderItem(item)}
              </Combobox.Item>
            )
            return contextActions ? (
              <ContextMenu key={itemKey(item)} trigger={row}>
                {contextActions(item)}
              </ContextMenu>
            ) : (
              row
            )
          }}
        </Combobox.List>
      )}
    </Combobox.Root>
  )
}

export function PaletteRow({
  icon,
  label,
  detail,
  monoDetail = false,
}: {
  readonly icon: React.ReactNode
  readonly label: React.ReactNode
  readonly detail?: React.ReactNode
  readonly monoDetail?: boolean
}): React.JSX.Element {
  return (
    <>
      <span className="grid w-[16px] flex-none place-items-center text-[var(--text-tertiary)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail !== undefined && (
        <span
          className={`min-w-0 max-w-[45%] truncate text-[var(--text-tertiary)] ${monoDetail ? "[font-family:var(--font-mono)] text-[12px]" : "text-[12px]"}`}
        >
          {detail}
        </span>
      )}
    </>
  )
}

// The top edge stays put while results change: it sits where a full list (45px input plus the
// list's max height) would be centred, so typing never makes the input jump.
const popupClasses = [
  "fixed z-[101] top-[max(52px,_calc(var(--viewport-h)_*_0.5_-_(45px_+_min(360px,_var(--viewport-h)_*_0.6))_/_2))] left-0 right-0 mx-auto w-[min(600px,_calc(var(--viewport-w)_-_32px))] overflow-hidden",
  "border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-lg)] bg-[var(--surface-menu)]",
  "[backdrop-filter:blur(32px)] [box-shadow:var(--shadow-popup),_inset_0_1px_0_var(--edge-highlight)]",
  "[@media(prefers-reduced-transparency:_reduce)]:[backdrop-filter:none]",
  "[@media(prefers-reduced-transparency:_reduce)]:bg-[var(--surface-overlay)]",
  "text-[var(--text-primary)] outline-none [transform-origin:top_center]",
].join(" ")

const itemClasses = [
  "motion-colors flex flex-none items-center gap-[10px] h-[32px] [padding:0_10px] rounded-[var(--radius-sm)]",
  "text-[13px] cursor-default [&:hover]:bg-[var(--surface-hover)]",
  "[&[data-highlighted]]:bg-[var(--surface-active)]",
].join(" ")
