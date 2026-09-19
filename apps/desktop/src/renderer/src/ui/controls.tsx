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
import { Check, ChevronDown } from "lucide-react"

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
      type={type}
      className={className === undefined ? "button" : `button ${className}`}
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
            type={type}
            aria-label={label}
            className={
              unstyled
                ? className
                : className === undefined
                  ? "icon-button"
                  : `icon-button ${className}`
            }
            {...rest}
          >
            {children}
          </BaseButton>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner className="tooltip-positioner" side="bottom" sideOffset={6}>
          <Tooltip.Popup className="tooltip">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function ContentTooltip({
  trigger,
  children,
  open,
  onOpenChange,
  className = "",
}: {
  trigger: ReactElement<Record<string, unknown>>
  children: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
}) {
  return (
    <Tooltip.Root open={open} onOpenChange={onOpenChange}>
      <Tooltip.Trigger render={trigger} />
      <Tooltip.Portal>
        <Tooltip.Positioner className="tooltip-positioner" side="top" sideOffset={8}>
          <Tooltip.Popup className={`tooltip ${className}`}>{children}</Tooltip.Popup>
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
      className="switch"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onCheckedChange={(next) => onCheckedChange(next)}
    >
      <BaseSwitch.Thumb className="switch-thumb" />
    </BaseSwitch.Root>
  )
}

export function Checkbox(props: BaseCheckbox.Root.Props): React.JSX.Element {
  return (
    <BaseCheckbox.Root className="choice-checkbox" {...props}>
      <BaseCheckbox.Indicator className="choice-indicator">
        <Check size={12} strokeWidth={2.5} />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  )
}

export function Radio(props: BaseRadio.Root.Props): React.JSX.Element {
  return (
    <BaseRadio.Root className="choice-radio" {...props}>
      <BaseRadio.Indicator className="choice-radio-indicator" />
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
      className={className === undefined ? "text-input" : `text-input ${className}`}
      data-mono={mono}
      onValueChange={onValueChange}
      {...rest}
    />
  )

  if (label === undefined) return input
  return (
    <Field.Root className="field">
      <Field.Label className="field-label">{label}</Field.Label>
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
      <Select.Trigger className={`${className ?? "button"} select-trigger`} aria-label={label}>
        <Select.Value className="select-value" />
        <Select.Icon className="chip-chevron">
          <ChevronDown size={13} strokeWidth={1.75} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          className="popup-positioner"
          align="start"
          sideOffset={6}
          collisionPadding={10}
          alignItemWithTrigger={false}
        >
          <Select.Popup className="popup select-popup">
            <Select.List>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value} className="menu-item">
                  <span className="menu-indicator">
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
          className="popup-positioner"
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={10}
        >
          <Menu.Popup className={className === undefined ? "popup" : `popup ${className}`}>
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
    <Menu.Item className="menu-item" disabled={disabled} onClick={onClick}>
      {icon !== undefined && <span className="menu-indicator">{icon}</span>}
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
      className={className === undefined ? "menu-item" : `menu-item ${className}`}
      value={value}
      disabled={disabled}
      closeOnClick
    >
      <span className="menu-indicator">
        <Menu.RadioItemIndicator>
          <Check size={13} strokeWidth={2.5} />
        </Menu.RadioItemIndicator>
      </span>
      {children}
      {detail !== undefined && <span className="menu-item-detail">{detail}</span>}
    </Menu.RadioItem>
  )
}

export const MenuRadioGroup = Menu.RadioGroup
export const MenuSeparator = (): React.JSX.Element => <Menu.Separator className="menu-separator" />

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
      <Menu.GroupLabel className="menu-group-label">{label}</Menu.GroupLabel>
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
        <Primitive.Backdrop className="dialog-backdrop" />
        <Primitive.Popup className="dialog">
          <Primitive.Close
            render={
              <BaseButton type="button" className="dialog-close" aria-label="Close dialog">
                ×
              </BaseButton>
            }
          />
          <Primitive.Title render={<h2 className="dialog-title" />}>{title}</Primitive.Title>
          {children}
          <div className="dialog-actions">{actions}</div>
        </Primitive.Popup>
      </Primitive.Portal>
    </Primitive.Root>
  )
}
