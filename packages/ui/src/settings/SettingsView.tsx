import { RemoteAccess } from "./RemoteAccess"
import { FadeDiv, TabIndicator } from "../ui/motion"
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react"
import type {
  AppSnapshot,
  Provider,
  ProviderModel,
  SetAppSettingsInput,
  UpsertModelInput,
} from "@meldshell/contracts"
import {
  ArrowLeft,
  Boxes,
  ChevronRight,
  CornerDownLeft,
  Info,
  Keyboard,
  MessagesSquare,
  MonitorSmartphone,
  Palette,
  Search,
  SearchX,
  X,
} from "lucide-react"
import { modelsForProvider } from "../data/catalog"
import { useViewStore, type SettingsSection } from "../app/view-store"
import { AppDialog, Button, ChordKeys, IconButton } from "../ui/controls"
import { useKeybindings } from "../app/keybindings"
import { cx, kbdClasses } from "../ui/styles"
import { useViewportTier, type ViewportTier } from "../app/viewport"
import { useMotionPreference } from "../ui/motion"
import { ModelDialog } from "./ModelDialog"
import { ProviderCard } from "./ProviderCard"
import {
  hasSubscriptionUsage,
  SubscriptionUsage,
  SubscriptionUsageRefresh,
} from "./SubscriptionUsage"
import { AppSettingsPanel } from "./AppSettingsPanel"
import { SettingsGroup, settingsCardClasses, settingsCardSurfaceClasses } from "./SettingsGroup"
import { searchSettings, type SettingsSearchEntry } from "./settings-search"
import { KeyboardSettings } from "./KeyboardSettings"
import { LoadoutSettings } from "./LoadoutSettings"
import { AppearancePreferences, ThreadPreferences } from "./Preferences"
import { DictationSettings } from "./DictationSettings"

interface SettingsViewProps {
  readonly settingsPending: boolean
  readonly settingsError: string | null
  readonly snapshot: AppSnapshot
  readonly sidebarWidth: number
  readonly onUpdateProvider: (
    providerId: string,
    patch: { displayName?: string; enabled?: boolean },
  ) => void
  readonly onUpsertModel: (input: UpsertModelInput) => void
  readonly onDeleteModel: (modelId: string) => void
  readonly onResetCatalog: (providerId: string) => void
  readonly onChangeAppSettings: (input: SetAppSettingsInput) => void
}

const SECTIONS: ReadonlyArray<{
  readonly id: SettingsSection
  readonly label: string
  readonly icon: typeof Palette
  readonly caption: string
}> = [
  {
    id: "threads",
    label: "Threads & agents",
    icon: MessagesSquare,
    caption: "How agents work, how threads are named and shown, and your saved loadouts.",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    caption: "Make MeldShell comfortable to read and use.",
  },
  {
    id: "keyboard",
    label: "Keyboard & dictation",
    icon: Keyboard,
    caption: "Change the keys behind each command, and talk to the composer instead of typing.",
  },
  {
    id: "providers",
    label: "Providers & models",
    icon: Boxes,
    caption:
      "Check each agent's connection, choose its models, and see what is left of your plans.",
  },
  {
    id: "account",
    label: "Account & devices",
    icon: MonitorSmartphone,
    caption: "Sign in to continue your threads from a phone or another computer.",
  },
  {
    id: "app",
    label: "App & updates",
    icon: Info,
    caption: "Updates, the runtime agents run in, and information about MeldShell.",
  },
]

const sectionFor = (id: SettingsSection) =>
  SECTIONS.find((entry) => entry.id === id) ?? SECTIONS[0]!

const settingsColumns = (tier: ViewportTier, sidebarWidth: number) => {
  if (tier === "phone") return "minmax(0, 1fr)"
  return `${tier === "compact" ? Math.min(sidebarWidth, 220) : Math.min(sidebarWidth, 280)}px minmax(0, 1fr)`
}

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform)

/** The search box at the top of the sidebar. Ctrl+F reaches it from anywhere in settings. */
function SettingsSearchField({
  inputRef,
  query,
  onQueryChange,
  onKeyDown,
  activeResult,
}: {
  readonly inputRef: React.RefObject<HTMLInputElement | null>
  readonly query: string
  readonly onQueryChange: (query: string) => void
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  /** The highlighted result, which arrow keys move while focus stays in the field. */
  readonly activeResult: string | undefined
}): React.JSX.Element {
  return (
    <div className="group/search relative flex items-center">
      <Search
        size={14}
        strokeWidth={1.9}
        aria-hidden="true"
        className="pointer-events-none absolute left-[10px] text-[var(--text-tertiary)] motion-colors group-focus-within/search:text-[var(--text-secondary)]"
      />
      <input
        ref={inputRef}
        type="search"
        role="searchbox"
        aria-label="Search settings"
        aria-controls="settings-search-results"
        aria-activedescendant={activeResult}
        placeholder="Search settings"
        spellCheck={false}
        autoComplete="off"
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        className={cx(
          "motion-colors w-full h-[32px] [padding:0_56px_0_31px] border-[1px] border-[color:var(--line-subtle)]",
          "rounded-[var(--radius)] bg-[var(--surface-card)] text-[var(--text-primary)] text-[13px] outline-none",
          "[&::placeholder]:text-[var(--text-tertiary)] [&::-webkit-search-cancel-button]:appearance-none",
          "[&:hover]:[border-color:var(--line)] [&:focus]:[border-color:var(--line-strong)]",
          "[&:focus]:[box-shadow:0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent)]",
        )}
      />
      {query === "" ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-[8px] flex items-center gap-[2px] text-[11px] motion-colors group-focus-within/search:opacity-0 [@media(pointer:coarse)]:hidden"
        >
          <kbd className={kbdClasses}>{isMac ? "⌘" : "Ctrl"}</kbd>
          <kbd className={kbdClasses}>F</kbd>
        </span>
      ) : (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onQueryChange("")
            inputRef.current?.focus()
          }}
          className="motion-colors absolute right-[5px] grid w-[22px] h-[22px] place-items-center rounded-[var(--radius-sm)] border-0 bg-transparent text-[var(--text-tertiary)] cursor-default [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]"
        >
          <X size={13} strokeWidth={2} />
        </button>
      )}
    </div>
  )
}

/** The way back, search, the sections, and the active section's outline. */
function SettingsSidebar({
  stacked,
  section,
  searching,
  outline,
  current,
  search,
  onSelect,
  onJump,
  onClose,
}: {
  readonly stacked: boolean
  readonly section: SettingsSection
  readonly searching: boolean
  readonly outline: readonly string[]
  readonly current: string | null
  readonly search: React.ReactNode
  readonly onSelect: (section: SettingsSection) => void
  readonly onJump: (group: string) => void
  readonly onClose: () => void
}): React.JSX.Element {
  const navRef = useRef<HTMLElement>(null)
  // A bar of sections can scroll, so the chosen one is kept in sight.
  useEffect(() => {
    if (!stacked) return
    navRef.current
      ?.querySelector(`[data-section="${section}"]`)
      ?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "instant" })
  }, [stacked, section])
  return (
    <aside
      className={
        stacked
          ? "grid min-w-0 gap-[8px] [padding:8px_12px_10px] border-b-[1px] border-b-[color:var(--line-subtle)]"
          : "flex min-h-0 flex-col gap-[14px] [padding:14px_12px_12px] border-r-[1px] border-r-[color:var(--line-subtle)]"
      }
    >
      <div className={`flex items-center gap-[6px] ${stacked ? "" : "[padding:0_2px]"}`}>
        <IconButton label="Close settings (Esc)" onClick={onClose}>
          <ArrowLeft size={16} strokeWidth={1.75} />
        </IconButton>
        <h1 className="m-0 [font-family:var(--font-display)] text-[15px] font-semibold tracking-[-0.01em] leading-[22px]">
          Settings
        </h1>
      </div>

      {search}

      <nav
        ref={navRef}
        aria-label="Settings sections"
        className={cx(
          "relative flex min-h-0",
          stacked
            ? "flex-row gap-[2px] overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
            : "flex-col gap-[1px] overflow-y-auto",
        )}
      >
        <TabIndicator
          selector='[aria-current="page"]'
          className={cx(
            "rounded-[var(--radius)] bg-[var(--surface-selected)] [box-shadow:inset_0_0_0_1px_var(--line-subtle)]",
            searching && "opacity-0",
          )}
        />
        {SECTIONS.map((entry) => {
          const active = entry.id === section
          const Icon = entry.icon
          return (
            <Fragment key={entry.id}>
              <button
                type="button"
                data-section={entry.id}
                aria-current={active && !searching ? "page" : undefined}
                onClick={() => onSelect(entry.id)}
                className={cx(
                  "group/nav motion-colors relative z-[1] flex shrink-0 items-center gap-[10px] border-0 rounded-[var(--radius)]",
                  "bg-transparent text-left text-[13px] cursor-default text-[var(--text-secondary)]",
                  "[&:hover]:text-[var(--text-primary)] [&:not([aria-current]):hover]:bg-[var(--surface-hover)]",
                  "[&[aria-current]]:text-[var(--text-primary)] [&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)]",
                  stacked
                    ? "h-[32px] [padding:0_11px] whitespace-nowrap"
                    : "min-h-[34px] [padding:0_10px]",
                )}
              >
                <Icon
                  size={15}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="flex-none text-[var(--text-tertiary)] motion-colors group-hover/nav:text-[var(--text-secondary)] group-aria-[current]/nav:text-[var(--text-primary)]"
                />
                {entry.label}
              </button>
              {active && !stacked && !searching && outline.length > 1 && (
                <FadeDiv
                  rise={-4}
                  duration={0.22}
                  role="list"
                  aria-label={`${entry.label} on this page`}
                  className="relative z-[1] flex flex-col [padding:2px_0_8px] before:absolute before:left-[17px] before:top-[2px] before:bottom-[8px] before:w-[1px] before:bg-[var(--line)]"
                >
                  {outline.map((group) => (
                    <div role="listitem" key={group}>
                      <button
                        type="button"
                        aria-current={group === current ? "location" : undefined}
                        onClick={() => onJump(group)}
                        className={cx(
                          "motion-colors relative flex w-full h-[28px] items-center [padding:0_10px_0_35px] border-0 rounded-[var(--radius-sm)]",
                          "bg-transparent text-left text-[12px] cursor-default text-[var(--text-tertiary)] whitespace-nowrap overflow-hidden text-ellipsis",
                          "[&:hover]:text-[var(--text-primary)] [&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)]",
                          "[&[aria-current]]:text-[var(--text-primary)]",
                          "after:absolute after:left-[16px] after:top-[7px] after:bottom-[7px] after:w-[3px] after:rounded-full",
                          "after:bg-[var(--accent)] after:opacity-0 after:motion-colors [&[aria-current]]:after:opacity-100",
                        )}
                      >
                        {group}
                      </button>
                    </div>
                  ))}
                </FadeDiv>
              )}
            </Fragment>
          )
        })}
      </nav>
    </aside>
  )
}

/** Wraps each occurrence of a search word in the label so a result shows why it matched. */
function Highlighted({
  text,
  words,
}: {
  readonly text: string
  readonly words: readonly string[]
}): React.JSX.Element {
  const lower = text.toLowerCase()
  const marks = Array.from({ length: text.length }, () => false)
  for (const word of words) {
    let at = lower.indexOf(word)
    while (word !== "" && at !== -1) {
      for (let index = at; index < at + word.length; index++) marks[index] = true
      at = lower.indexOf(word, at + word.length)
    }
  }
  const parts: Array<{ text: string; mark: boolean }> = []
  for (let index = 0; index < text.length; index++) {
    const last = parts.at(-1)
    if (last && last.mark === marks[index]) last.text += text[index]
    else parts.push({ text: text[index]!, mark: marks[index]! })
  }
  return (
    <>
      {parts.map((part, index) =>
        part.mark ? (
          <mark key={index} className="bg-transparent text-[var(--accent)]">
            {part.text}
          </mark>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}

/** Matches grouped by section, in the order their best match ranks; arrows and Enter pick one. */
function SearchResults({
  query,
  results,
  selected,
  onHover,
  onOpen,
}: {
  readonly query: string
  readonly results: readonly SettingsSearchEntry[]
  readonly selected: number
  readonly onHover: (index: number) => void
  readonly onOpen: (entry: SettingsSearchEntry) => void
}): React.JSX.Element {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const bindings = useKeybindings((state) => state.bindings)
  const listRef = useRef<HTMLDivElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Each new selection scrolls into view.
  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", behavior: "instant" })
  }, [selected])
  if (results.length === 0)
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-[10px] [padding:72px_24px] text-center"
      >
        <span className="grid w-[44px] h-[44px] place-items-center rounded-full border-[1px] border-[color:var(--line-subtle)] bg-[var(--surface-card)] text-[var(--text-tertiary)]">
          <SearchX size={18} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <p className="m-0 text-[13px] font-medium text-[var(--text-primary)]">
          No settings match “{query.trim()}”
        </p>
        <p className="m-0 text-[12px] text-[var(--text-secondary)]">
          Try a broader word, such as theme, shortcut, or model.
        </p>
      </div>
    )
  const sections = SECTIONS.map((section) => ({
    section,
    entries: results
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.section === section.id),
  }))
    .filter((group) => group.entries.length > 0)
    .sort((a, b) => a.entries[0]!.index - b.entries[0]!.index)
  return (
    <div ref={listRef} id="settings-search-results" role="listbox" aria-label="Matching settings">
      {sections.map(({ section, entries }) => {
        return (
          <div key={section.id} role="group" aria-label={section.label} className="mb-[24px]">
            <p className="m-0 [padding:0_2px_8px] text-[var(--text-tertiary)] text-[12px] font-medium">
              {section.label}
            </p>
            <div className={settingsCardClasses}>
              {entries.map(({ entry, index }) => {
                const active = index === selected
                return (
                  <div
                    key={`${entry.section}:${entry.group}:${entry.label}`}
                    id={`settings-result-${index}`}
                    role="option"
                    aria-selected={active}
                    tabIndex={-1}
                    onMouseMove={() => onHover(index)}
                    onClick={() => onOpen(entry)}
                    className={cx(
                      "motion-colors flex min-h-[48px] items-center justify-between gap-[16px] [padding:8px_12px_8px_16px] cursor-default",
                      "first:rounded-t-[inherit] last:rounded-b-[inherit]",
                      active && "bg-[var(--surface-hover)]",
                    )}
                  >
                    <span className="flex min-w-0 flex-col gap-[2px]">
                      <span className="overflow-hidden text-[var(--text-primary)] text-[13px] text-ellipsis whitespace-nowrap">
                        <Highlighted text={entry.label} words={words} />
                      </span>
                      {entry.group !== entry.label && (
                        <span className="overflow-hidden text-[var(--text-tertiary)] text-[12px] text-ellipsis whitespace-nowrap">
                          {entry.group}
                        </span>
                      )}
                    </span>
                    <span
                      aria-hidden="true"
                      className="flex flex-none items-center gap-[6px] text-[var(--text-tertiary)] text-[11px]"
                    >
                      {active ? (
                        <>
                          Open
                          <kbd className={kbdClasses}>
                            <CornerDownLeft size={10} strokeWidth={2} />
                          </kbd>
                        </>
                      ) : entry.shortcut !== undefined && bindings[entry.shortcut] ? (
                        <ChordKeys chord={bindings[entry.shortcut]} />
                      ) : (
                        <ChevronRight size={14} strokeWidth={1.75} />
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** The titled groups on the page, and the one being read: the last whose top has passed the fold. */
function usePageOutline(
  content: React.RefObject<HTMLDivElement | null>,
  page: string,
): {
  readonly outline: readonly string[]
  readonly current: string | null
  readonly jump: (group: string) => void
  readonly hold: (group: string) => void
} {
  const [outline, setOutline] = useState<readonly string[]>([])
  const [current, setCurrent] = useState<string | null>(null)
  const reduced = useMotionPreference()
  // A jump owns the highlight until its scroll settles, so passing groups do not flicker.
  const jumping = useRef<string | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: A new page is a new set of groups.
  useLayoutEffect(() => {
    const container = content.current
    if (!container) return
    const groups = () =>
      Array.from(container.querySelectorAll<HTMLElement>("[data-settings-group]")).filter(
        (element) => element.offsetParent !== null,
      )
    const measure = () => {
      const list = groups()
      const titles = list.map((element) => element.dataset.settingsGroup ?? "")
      setOutline((previous) =>
        previous.length === titles.length && previous.every((title, i) => title === titles[i])
          ? previous
          : titles,
      )
      if (jumping.current !== null) return
      const top = container.getBoundingClientRect().top + 72
      const atEnd = container.scrollTop + container.clientHeight >= container.scrollHeight - 4
      let reading = list[0]?.dataset.settingsGroup ?? null
      for (const element of list)
        if (element.getBoundingClientRect().top <= top)
          reading = element.dataset.settingsGroup ?? null
      if (atEnd && container.scrollTop > 0) reading = list.at(-1)?.dataset.settingsGroup ?? reading
      setCurrent(reading)
    }
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const settle = () => {
      jumping.current = null
      schedule()
    }
    measure()
    const mutations = new MutationObserver(schedule)
    mutations.observe(container, { childList: true, subtree: true })
    container.addEventListener("scroll", schedule, { passive: true })
    container.addEventListener("scrollend", settle)
    return () => {
      cancelAnimationFrame(frame)
      mutations.disconnect()
      container.removeEventListener("scroll", schedule)
      container.removeEventListener("scrollend", settle)
    }
  }, [content, page])

  /** Marks a group as the one being read while a scroll to it settles. */
  const hold = (group: string) => {
    jumping.current = group
    setCurrent(group)
    // Already in place: no scroll happens, so no scrollend arrives to release the highlight.
    window.setTimeout(() => {
      if (jumping.current === group) jumping.current = null
    }, 900)
  }
  const jump = (group: string) => {
    const element = content.current?.querySelector<HTMLElement>(
      `[data-settings-group="${CSS.escape(group)}"]`,
    )
    if (!element) return
    hold(group)
    element.scrollIntoView({ block: "start", behavior: reduced ? "instant" : "smooth" })
    element.focus({ preventScroll: true })
  }
  return { outline, current, jump, hold }
}

export function SettingsView(props: SettingsViewProps): React.JSX.Element {
  const { snapshot, settingsError, sidebarWidth, onUpsertModel, onDeleteModel, onResetCatalog } =
    props

  const section = useViewStore((state) => state.settingsSection)
  const target = useViewStore((state) => state.settingsTarget)
  const selectSection = useViewStore((state) => state.selectSettingsSection)
  const clearTarget = useViewStore((state) => state.clearSettingsTarget)
  const closeSettings = useViewStore((state) => state.closeSettings)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const searching = query.trim().length > 0
  const results = searchSettings(query, snapshot.providers, {
    editor: window.meldshell.desktop?.listEditors !== undefined,
    environment: window.meldshell.desktop?.environment !== undefined,
    hostControl: window.meldshell.hostControl !== undefined,
  })
  const { outline, current, jump, hold } = usePageOutline(contentRef, searching ? "" : section)

  // Ctrl+F finds a setting from anywhere on the page.
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key === "f"
      ) {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener("keydown", focusSearch)
    return () => window.removeEventListener("keydown", focusSearch)
  }, [])

  // A new page or the results start at the top; a target below scrolls on from there.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only a change of page resets the scroll.
  useLayoutEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "instant" })
  }, [section, searching])

  // Brings a setting opened from search or another screen into view, and lets it glow once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: A target waits for its page to render.
  useLayoutEffect(() => {
    if (searching || !target) return
    const content = contentRef.current
    if (!content) return
    let timer = 0
    const reveal = () => {
      const element = Array.from(
        content.querySelectorAll<HTMLElement>("[data-setting-label]"),
      ).find((candidate) => candidate.dataset.settingLabel === target)
      if (!element || element.offsetParent === null) return false
      const group = element.hasAttribute("data-settings-group")
      element.scrollIntoView({ block: group ? "start" : "center", behavior: "instant" })
      element.focus({ preventScroll: true })
      element.removeAttribute("data-flash")
      void element.offsetWidth
      element.setAttribute("data-flash", "")
      timer = window.setTimeout(() => element.removeAttribute("data-flash"), 1900)
      const owner = element.closest<HTMLElement>("[data-settings-group]")?.dataset.settingsGroup
      if (owner) hold(owner)
      clearTarget()
      return true
    }
    if (reveal()) return () => window.clearTimeout(timer)
    content.scrollTop = 0
    const observer = new MutationObserver(() => {
      if (reveal()) observer.disconnect()
    })
    observer.observe(content, { childList: true, subtree: true, attributes: true })
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [target, searching, section, clearTarget])

  const openResult = (entry: SettingsSearchEntry) => {
    setQuery("")
    selectSection(entry.section, entry.target ?? entry.label)
  }

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && query !== "") {
      // Clearing comes first; a second Escape leaves settings.
      event.preventDefault()
      event.stopPropagation()
      setQuery("")
      return
    }
    if (!searching || results.length === 0) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setSelected((index) => (index + step + results.length) % results.length)
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const entry = results[Math.min(selected, results.length - 1)]
      if (entry) openResult(entry)
    }
  }

  const [modelDialog, setModelDialog] = useState<{
    readonly providerId: string
    readonly model: ProviderModel | null
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProviderModel | null>(null)
  const [resetTarget, setResetTarget] = useState<Provider | null>(null)

  const tier = useViewportTier()
  const stacked = tier === "phone"
  const active = sectionFor(section)

  return (
    <div
      data-settings-layout
      className={`grid h-full min-h-0 ${stacked ? "grid-rows-[auto_minmax(0,_1fr)]" : ""}`}
      style={{ gridTemplateColumns: settingsColumns(tier, sidebarWidth) }}
    >
      <SettingsSidebar
        stacked={stacked}
        section={section}
        searching={searching}
        outline={outline}
        current={current}
        onClose={closeSettings}
        onJump={jump}
        onSelect={(next) => {
          setQuery("")
          if (next === section && !searching) contentRef.current?.scrollTo({ top: 0 })
          selectSection(next)
        }}
        search={
          <SettingsSearchField
            inputRef={searchRef}
            query={query}
            onQueryChange={(next) => {
              setQuery(next)
              setSelected(0)
            }}
            onKeyDown={onSearchKeyDown}
            activeResult={
              searching && results.length > 0
                ? `settings-result-${Math.min(selected, results.length - 1)}`
                : undefined
            }
          />
        }
      />

      <div
        ref={contentRef}
        role="region"
        aria-label={searching ? "Search settings" : active.label}
        tabIndex={-1}
        className="[container-type:inline-size] min-w-0 min-h-0 overflow-y-auto outline-none [scrollbar-gutter:stable_both-edges] [&_[data-flash]]:animate-setting-flash [&_[data-flash]]:[animation-duration:calc(1800ms_*_var(--motion-scale,_1))]"
      >
        <FadeDiv
          key={searching ? "search" : section}
          rise={6}
          duration={0.22}
          className="w-[min(720px,_calc(100%_-_64px))] [margin:0_auto] [padding:36px_0_64px] [@container(max-width:_640px)]:w-[calc(100%_-_40px)] [@container(max-width:_460px)]:w-[calc(100%_-_24px)] [@container(max-width:_460px)]:pt-[22px]"
        >
          <header className="flex min-w-0 flex-col gap-[4px] mb-[28px] [padding:0_2px]">
            <h2 className="m-0 [font-family:var(--font-display)] text-[22px] font-semibold tracking-[-0.015em] leading-[1.25]">
              {searching ? "Search results" : active.label}
            </h2>
            <p
              role={searching ? "status" : undefined}
              className="m-0 text-[var(--text-secondary)] text-[13px] leading-[1.5]"
            >
              {searching
                ? results.length === 0
                  ? "Nothing found."
                  : `${results.length} ${results.length === 1 ? "setting matches" : "settings match"} “${query.trim()}”. Use the arrow keys and Enter to open one.`
                : active.caption}
            </p>
          </header>

          {settingsError && (
            <p
              role="alert"
              className="m-0 mb-[20px] [padding:10px_14px] border-[1px] border-[color:color-mix(in_srgb,var(--color-deleted)_35%,transparent)] rounded-[var(--radius)] text-[var(--color-deleted)] text-[12px]"
            >
              {settingsError}
            </p>
          )}
          {searching ? (
            <SearchResults
              query={query}
              results={results}
              selected={Math.min(selected, Math.max(results.length - 1, 0))}
              onHover={setSelected}
              onOpen={openResult}
            />
          ) : (
            <SettingsContent
              {...props}
              section={section}
              onEditModel={(providerId, model) => setModelDialog({ providerId, model })}
              onRemoveModel={setDeleteTarget}
              onRestoreCatalog={setResetTarget}
            />
          )}
        </FadeDiv>
      </div>

      {modelDialog !== null && (
        <ModelDialog
          key={`${modelDialog.providerId}:${modelDialog.model?.id ?? "new"}`}
          providerId={modelDialog.providerId}
          model={modelDialog.model}
          siblings={modelsForProvider(snapshot, modelDialog.providerId)}
          onClose={() => setModelDialog(null)}
          onSubmit={onUpsertModel}
        />
      )}

      <AppDialog
        alert
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Remove this model from the catalog?"
        actions={
          <>
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleteTarget !== null) onDeleteModel(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              Remove model
            </Button>
          </>
        }
      >
        <p>
          “{deleteTarget?.displayName}” will no longer be offered in the composer. Threads already
          using it switch to another available model. You can add it again later.
        </p>
      </AppDialog>

      <AppDialog
        alert
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null)
        }}
        title={`Restore the built-in ${resetTarget?.displayName ?? ""} models?`}
        actions={
          <>
            <Button onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (resetTarget !== null) onResetCatalog(resetTarget.id)
                setResetTarget(null)
              }}
            >
              Restore models
            </Button>
          </>
        }
      >
        <p>
          Built-in models get their original names, reasoning options, and visibility back. Models
          you added yourself are kept. Other providers are not affected.
        </p>
      </AppDialog>
    </div>
  )
}

interface SettingsContentProps extends SettingsViewProps {
  readonly section: SettingsSection
  readonly onEditModel: (providerId: string, model: ProviderModel | null) => void
  readonly onRemoveModel: (model: ProviderModel) => void
  readonly onRestoreCatalog: (provider: Provider) => void
}

function SettingsContent({
  section,
  snapshot,
  settingsPending,
  onChangeAppSettings,
  onUpdateProvider,
  onUpsertModel,
  onEditModel,
  onRemoveModel,
  onRestoreCatalog,
}: SettingsContentProps): React.JSX.Element {
  const usageProviders = snapshot.providers.filter(hasSubscriptionUsage)
  switch (section) {
    case "threads":
      return (
        <>
          <ThreadPreferences
            snapshot={snapshot}
            onChange={onChangeAppSettings}
            pending={settingsPending}
          />
          <LoadoutSettings
            snapshot={snapshot}
            pending={settingsPending}
            onChange={onChangeAppSettings}
          />
        </>
      )
    case "appearance":
      return (
        <AppearancePreferences
          settings={snapshot.settings}
          onChange={onChangeAppSettings}
          pending={settingsPending}
        />
      )
    case "keyboard":
      return (
        <>
          <KeyboardSettings pending={settingsPending} onChange={onChangeAppSettings} />
          <DictationSettings
            settings={snapshot.settings}
            pending={settingsPending}
            onChange={onChangeAppSettings}
          />
        </>
      )
    case "providers":
      return (
        <>
          <SettingsGroup
            title="Providers"
            description="Open a provider to check its connection, rename it, and choose which of its models the composer offers."
            bare
          >
            {snapshot.providers.length === 0 ? (
              <p
                className={`m-0 [padding:28px_16px] text-[var(--text-tertiary)] text-[13px] text-center ${settingsCardSurfaceClasses}`}
              >
                No providers are configured.
              </p>
            ) : (
              <div className="flex flex-col gap-[10px]">
                {snapshot.providers.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    models={modelsForProvider(snapshot, provider.id)}
                    onRename={(displayName) => onUpdateProvider(provider.id, { displayName })}
                    onToggleProvider={(enabled) => onUpdateProvider(provider.id, { enabled })}
                    onToggleModel={(model, patch) =>
                      onUpsertModel({
                        providerId: provider.id,
                        modelId: model.id,
                        ...patch,
                      })
                    }
                    onEditModel={(model) => onEditModel(provider.id, model)}
                    onDeleteModel={onRemoveModel}
                    onAddModel={() => onEditModel(provider.id, null)}
                    onResetCatalog={() => onRestoreCatalog(provider)}
                  />
                ))}
              </div>
            )}
          </SettingsGroup>
          {usageProviders.length > 0 && (
            <SettingsGroup
              title="Subscription usage"
              description="What is left of each plan's allowances, and when they reset."
              action={<SubscriptionUsageRefresh providers={usageProviders} />}
              bare
            >
              <SubscriptionUsage providers={usageProviders} />
            </SettingsGroup>
          )}
        </>
      )
    case "account":
      return <RemoteAccess />
    case "app":
      return (
        <AppSettingsPanel
          settings={snapshot.settings}
          pending={settingsPending}
          onChange={onChangeAppSettings}
        />
      )
  }
}
