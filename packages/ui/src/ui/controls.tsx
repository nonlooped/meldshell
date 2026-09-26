import {
  buttonClasses,
  cx,
  iconButtonClasses,
  kbdClasses,
  menuGutterClasses,
  menuItemClasses,
  menuPopupClasses,
  panelNoteClasses,
  textInputClasses,
  tooltipPopupClasses,
} from "./styles"
import { Pressable, MotionSurface } from "./motion"
import type { ReactElement, ReactNode } from "react"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { Field } from "@base-ui-components/react/field"
import { Input } from "@base-ui-components/react/input"
import { Dialog } from "@base-ui-components/react/dialog"
import { AlertDialog } from "@base-ui-components/react/alert-dialog"
import { Checkbox as BaseCheckbox } from "@base-ui-components/react/checkbox"
import { Radio as BaseRadio } from "@base-ui-components/react/radio"
import { Menu } from "@base-ui-components/react/menu"
import { Select } from "@base-ui-components/react/select"
import { Switch as BaseSwitch } from "@base-ui-components/react/switch"
import { Tooltip } from "@base-ui-components/react/tooltip"
import { Check, ChevronDown, X } from "lucide-react"

/*
 * MeldShell owns every pixel of its controls; Base UI contributes only behaviour (focus capture,
 * roving tab index, typeahead, dismissal, portalling). These wrappers exist so feature code never
 * repeats the portal/positioner/popup scaffolding.
 */

type ButtonVariant = "default" | "primary" | "ghost"

interface ButtonProps extends React.ComponentPropsWithoutRef<"button"> {
  readonly variant?: ButtonVariant
  readonly size?: "md" | "sm"
  readonly block?: boolean
  readonly icon?: ReactNode
}

export function Button({
  variant = "default",
  size = "md",
  block = false,
  icon,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <BaseButton
      render={<Pressable />}
      type={type}
      className={cx("motion-colors", buttonClasses, className)}
      data-variant={variant}
      data-size={size}
      data-block={block}
      {...rest}
    >
      {icon}
      {children}
    </BaseButton>
  )
}

interface IconButtonProps extends React.ComponentPropsWithoutRef<"button"> {
  readonly label: string
  /** Keep a feature's existing button styles instead of the standard icon-button dimensions. */
  readonly unstyled?: boolean
}

export function IconButton({
  label,
  unstyled = false,
  children,
  className,
  type = "button",
  ...rest
}: IconButtonProps): React.JSX.Element {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <BaseButton
            render={<Pressable />}
            type={type}
            aria-label={label}
            className={cx("motion-colors", !unstyled && iconButtonClasses, className)}
            {...rest}
          >
            {children}
          </BaseButton>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner className="z-[300]" side="bottom" sideOffset={6}>
          <Tooltip.Popup render={<MotionSurface kind="tooltip" />} className={tooltipPopupClasses}>
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

/** A tooltip with rich content; it follows hover and focus unless the caller controls `open`. */
export function ContentTooltip({
  trigger,
  children,
  open,
  onOpenChange,
  disabled = false,
  className = "",
  side = "top",
}: {
  trigger: ReactElement<Record<string, unknown>>
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  className?: string
  side?: "top" | "right"
}) {
  return (
    <Tooltip.Root
      disabled={disabled}
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange !== undefined ? { onOpenChange } : {})}
    >
      <Tooltip.Trigger render={trigger} />
      <Tooltip.Portal>
        <Tooltip.Positioner className="z-[300]" side={side} sideOffset={8}>
          <Tooltip.Popup
            render={<MotionSurface kind="tooltip" />}
            className={cx(tooltipPopupClasses, className)}
          >
            {children}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

interface SwitchProps {
  readonly checked: boolean
  readonly onCheckedChange: (checked: boolean) => void
  readonly disabled?: boolean
  readonly label: string
}

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
}: SwitchProps): React.JSX.Element {
  return (
    <BaseSwitch.Root
      className={`motion-colors ${switchClasses}`}
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onCheckedChange={(next) => onCheckedChange(next)}
    >
      <BaseSwitch.Thumb className="motion-transform motion-duration-200 switch-thumb block w-[13px] h-[13px] rounded-[50%] bg-[var(--text-secondary)] [transform:translateX(2px)]" />
    </BaseSwitch.Root>
  )
}

export function Checkbox(props: BaseCheckbox.Root.Props): React.JSX.Element {
  return (
    <BaseCheckbox.Root
      className="inline-flex items-center justify-center w-[15px] h-[15px] flex-[0_0_15px] border-[1px] border-[color:var(--line-strong)] rounded-[3px] bg-[var(--surface-hover)] text-[var(--accent-foreground)] [&[data-checked]]:[border-color:var(--accent)] [&[data-checked]]:bg-[var(--accent)]"
      {...props}
    >
      <BaseCheckbox.Indicator className="flex">
        <Check size={12} strokeWidth={2.5} />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  )
}

export function Radio(props: BaseRadio.Root.Props): React.JSX.Element {
  return (
    <BaseRadio.Root
      className="inline-flex items-center justify-center w-[15px] h-[15px] flex-[0_0_15px] border-[1px] border-[color:var(--line-strong)] bg-[var(--surface-hover)] text-[var(--accent-foreground)] rounded-[50%] [&[data-checked]]:[border-color:var(--accent)] [&[data-checked]]:bg-[var(--accent)]"
      {...props}
    >
      <BaseRadio.Indicator className="w-[5px] h-[5px] rounded-[50%] [background:currentColor]" />
    </BaseRadio.Root>
  )
}

interface TextFieldProps extends Omit<React.ComponentPropsWithoutRef<"input">, "onChange"> {
  readonly label?: string
  readonly mono?: boolean
  readonly onValueChange?: (value: string) => void
}

export function TextField({
  label,
  mono = false,
  onValueChange,
  className,
  ...rest
}: TextFieldProps): React.JSX.Element {
  const input = (
    <Input
      type="text"
      spellCheck={false}
      autoComplete="off"
      className={cx("motion-colors motion-duration-200", textInputClasses, className)}
      data-mono={mono}
      onValueChange={onValueChange}
      {...rest}
    />
  )

  if (label === undefined) return input
  return (
    <Field.Root className="field block [&_+_.field]:mt-[14px]">
      <Field.Label className="block mb-[6px] text-[var(--text-secondary)] text-[11.5px] font-medium">
        {label}
      </Field.Label>
      {input}
    </Field.Root>
  )
}

export function SelectField<Value extends string>({
  id,
  className,
  label,
  value,
  options,
  disabled = false,
  onValueChange,
}: {
  readonly id?: string
  readonly className?: string
  readonly label: string
  readonly value: Value
  readonly options: ReadonlyArray<{ readonly value: Value; readonly label: string }>
  readonly disabled?: boolean
  readonly onValueChange: (value: Value) => void
}): React.JSX.Element {
  return (
    <Select.Root
      id={id}
      value={value}
      items={options}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next)
      }}
    >
      <Select.Trigger
        className={`motion-colors ${className ?? buttonClasses} w-full min-w-0 min-h-[34px] justify-between!`}
        aria-label={label}
      >
        <Select.Value className="overflow-hidden text-ellipsis whitespace-nowrap" />
        <Select.Icon className="flex-none text-[var(--text-tertiary)]">
          <ChevronDown size={13} strokeWidth={1.75} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          className="z-[200]"
          align="start"
          sideOffset={6}
          collisionPadding={10}
          alignItemWithTrigger={false}
        >
          <Select.Popup render={<MotionSurface kind="popup" />} className={selectPopupClasses}>
            <Select.List>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className={`motion-colors ${menuItemClasses}`}
                >
                  <span className={menuGutterClasses}>
                    <Select.ItemIndicator>
                      <Check size={13} strokeWidth={2} />
                    </Select.ItemIndicator>
                  </span>
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

/**
 * A shortcut chord such as `Ctrl+Shift+B` drawn as one keycap per key. `Ctrl++` ends in the plus
 * key itself.
 */
export function ChordKeys({
  chord,
  className = "",
}: {
  chord: string
  className?: string
}): React.JSX.Element {
  const match = /^(.*?)\+?([^+]+|\+)$/.exec(chord)
  const keys = match
    ? [...(match[1] ?? "").split("+").filter((part) => part !== ""), match[2] ?? ""]
    : [chord]
  return (
    <kbd
      className={`inline-flex items-center gap-[3px] [font:inherit] ${className}`}
      aria-label={chord}
    >
      {keys.map((key) => (
        <kbd key={key} className={kbdClasses} aria-hidden="true">
          {key}
        </kbd>
      ))}
    </kbd>
  )
}

/** Muted copy in a panel: an empty state, progress (`status`), or a failure (`alert`). */
export function PanelNote({
  role,
  children,
}: {
  readonly role?: "status" | "alert"
  readonly children: ReactNode
}): React.JSX.Element {
  return (
    <p className={panelNoteClasses} role={role}>
      {children}
    </p>
  )
}

/** A failed query's message followed by a control that runs it again. */
export function QueryError({
  query,
  action = "Retry",
  children,
}: {
  readonly query: { readonly error: Error; readonly refetch: () => unknown }
  readonly action?: string
  readonly children?: ReactNode
}): React.JSX.Element {
  return (
    <PanelNote role="alert">
      {query.error.message}
      {children}
      <Button size="sm" onClick={() => void query.refetch()}>
        {action}
      </Button>
    </PanelNote>
  )
}

interface MenuRootProps {
  /** Base UI merges its trigger props into this element, so it must be a single element. */
  readonly trigger: ReactElement<Record<string, unknown>>
  readonly children: ReactNode
  readonly align?: "start" | "center" | "end"
  readonly side?: "top" | "bottom" | "left" | "right"
  readonly className?: string
}

export function DropdownMenu({
  trigger,
  children,
  align = "start",
  side = "bottom",
  className,
}: MenuRootProps): React.JSX.Element {
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger} />
      <Menu.Portal>
        <Menu.Positioner
          className="z-[200]"
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={10}
        >
          <Menu.Popup
            render={<MotionSurface kind="popup" />}
            className={cx(menuPopupClasses, className)}
          >
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

interface MenuActionProps {
  readonly onClick: () => void
  readonly icon?: ReactNode
  readonly children: ReactNode
  readonly disabled?: boolean
}

export function MenuAction({
  onClick,
  icon,
  children,
  disabled = false,
}: MenuActionProps): React.JSX.Element {
  return (
    <Menu.Item className={`motion-colors ${menuItemClasses}`} disabled={disabled} onClick={onClick}>
      {icon !== undefined && <span className={menuGutterClasses}>{icon}</span>}
      {children}
    </Menu.Item>
  )
}

interface MenuChoiceProps {
  readonly value: string
  readonly children: ReactNode
  readonly detail?: ReactNode
  readonly disabled?: boolean
  readonly className?: string
}

/**
 * A radio row that shows its selected state with a tick in the same gutter used by action icons.
 *
 * Base UI keeps a menu open after a radio item is chosen, which suits multi-step filter menus. Every
 * choice here is a one-shot switch, so `closeOnClick` is forced on: without it the menu stays open
 * and its modal backdrop leaves the rest of the window inert.
 */
export function MenuChoice({
  value,
  children,
  detail,
  disabled = false,
  className,
}: MenuChoiceProps): React.JSX.Element {
  return (
    <Menu.RadioItem
      className={cx("motion-colors", menuItemClasses, className)}
      value={value}
      disabled={disabled}
      closeOnClick
    >
      <span className={menuGutterClasses}>
        <Menu.RadioItemIndicator>
          <Check size={13} strokeWidth={2.5} />
        </Menu.RadioItemIndicator>
      </span>
      {children}
      {detail !== undefined && (
        <span className="ml-[auto] pl-[16px] text-[var(--text-tertiary)] [font-family:var(--font-mono)] text-[10.5px]">
          {detail}
        </span>
      )}
    </Menu.RadioItem>
  )
}

export const MenuRadioGroup = Menu.RadioGroup
export const MenuSeparator = (): React.JSX.Element => (
  <Menu.Separator className="h-[1px] [margin:4px_6px] bg-[var(--line-subtle)]" />
)

interface MenuGroupProps {
  readonly label: string
  readonly children: ReactNode
}

/**
 * Base UI reads the label's owning group from context, so the label can never be rendered on its
 * own; this pairs the two and is the only supported way to caption a run of menu items.
 */
export function MenuGroup({ label, children }: MenuGroupProps): React.JSX.Element {
  return (
    <Menu.Group>
      <Menu.GroupLabel className="[padding:9px_9px_5px] text-[var(--text-tertiary)] text-[11px] font-medium">
        {label}
      </Menu.GroupLabel>
      {children}
    </Menu.Group>
  )
}

interface AppDialogProps {
  readonly alert?: boolean
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly children?: ReactNode
  readonly actions: ReactNode
}

export function AppDialog({
  alert = false,
  open,
  onOpenChange,
  title,
  children,
  actions,
}: AppDialogProps): React.JSX.Element {
  const Primitive = alert ? AlertDialog : Dialog
  return (
    <Primitive.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Primitive.Portal>
        <Primitive.Backdrop
          render={<MotionSurface kind="backdrop" />}
          className="fixed z-[100] [inset:0] [background:rgba(0,_0,_0,_0.45)] [backdrop-filter:blur(2px)]"
        />
        <Primitive.Popup render={<MotionSurface kind="dialog" />} className={dialogClasses}>
          <Primitive.Close
            render={
              <BaseButton
                render={<Pressable />}
                type="button"
                className="motion-colors absolute top-[14px] right-[12px] grid w-[26px] h-[26px] border-0 rounded-[var(--radius-sm)] bg-transparent text-[var(--text-tertiary)] cursor-default place-items-center [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]"
                aria-label="Close dialog"
              >
                <X size={15} />
              </BaseButton>
            }
          />
          <Primitive.Title
            render={
              <h2 className="m-0 [padding:22px_44px_0_20px] [font-family:var(--font-display)] text-[18px] font-semibold tracking-[-0.01em] leading-[1.35]" />
            }
          >
            {title}
          </Primitive.Title>
          {children}
          <div className="flex flex-wrap items-center justify-end gap-[8px] [padding:14px_20px] border-t-[1px] border-t-[color:var(--line-subtle)] mt-[18px] bg-[var(--surface-hover)] [border-end-start-radius:var(--radius-xl)] [border-end-end-radius:var(--radius-xl)] [&_.button]:min-w-[80px] [&_.button]:h-[32px]">
            {actions}
          </div>
        </Primitive.Popup>
      </Primitive.Portal>
    </Primitive.Root>
  )
}

const switchClasses = [
  "switch relative w-[34px] h-[19px] flex-[0_0_34px] p-0 border-[1px] border-[color:var(--line-strong)]",
  "rounded-[20px] [background:rgba(0,_0,_0,_0.27)] [:root[data-theme='light']_&:not([data-checked])]:bg-[var(--surface-active)]",
  "cursor-default",
  "[&[data-checked]]:[border-color:transparent] [&[data-checked]]:bg-[var(--accent)]",
  "[&:disabled]:opacity-[0.45] [&[data-checked]_.switch-thumb]:bg-[var(--accent-foreground)]",
  "[&[data-checked]_.switch-thumb]:[transform:translateX(17px)]",
].join(" ")

const selectPopupClasses = cx(
  menuPopupClasses,
  "min-w-[var(--anchor-width)] max-w-[min(420px,_var(--available-width))] [&_.menu-item]:h-auto",
  "[&_.menu-item]:min-h-[30px] [&_.menu-item]:py-[6px] [&_.menu-item]:[overflow-wrap:anywhere]",
)

const dialogClasses = [
  "fixed z-[101] top-[50%] left-[50%] w-[440px] max-w-[calc(100vw_-_48px)] max-h-[calc(100vh_-_64px)]",
  "overflow-y-auto p-0 border-[1px] border-[color:var(--line)] rounded-[var(--radius-xl)]",
  "bg-[var(--surface-overlay)] [backdrop-filter:blur(32px)_saturate(120%)]",
  "[box-shadow:var(--shadow-popup),_inset_0_1px_0_var(--edge-highlight)] text-[var(--text-primary)]",
  "outline-none [transform:translate(-50%,_-50%)] [&_>_p]:m-0 [&_>_p]:[padding:8px_20px_0]",
  "[&_>_p]:text-[var(--text-secondary)] [&_>_p]:text-[12.5px] [&_>_p]:leading-[1.6]",
  "[&_.plan-review]:[margin:0_20px_20px] [&_.plan-review]:max-h-[50vh] [&_.plan-review]:overflow-auto",
  "[&_>_.text-input]:w-[calc(100%_-_40px)] [&_>_.text-input]:[margin:12px_20px_0]",
  "[@media(prefers-reduced-transparency:_reduce)]:[backdrop-filter:none]",
  "[&:has(.workspace-manager)]:w-[640px] [&:has(.setup-log)]:w-[680px] [&_>_.field]:[margin:18px_20px_0]",
  "[&:has(.search-controls)]:w-[680px] [&:has(.markdown-lightbox)]:w-[min(1100px,_90vw)]",
  "[&:has(.markdown-lightbox)]:max-w-[90vw] [&:has(.markdown-table-expanded)]:w-[min(1400px,_94vw)]",
  "[&:has(.markdown-table-expanded)]:max-w-[94vw]",
].join(" ")
