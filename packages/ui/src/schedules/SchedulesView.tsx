import type { AppSnapshot } from "@meldshell/contracts"
import { ArrowLeft } from "lucide-react"
import { useViewStore } from "../app/view-store"
import { IconButton } from "../ui/controls"
import { FadeDiv } from "../ui/motion"
import { ScheduledPrompts } from "./ScheduledPrompts"

export function SchedulesView({ snapshot }: { readonly snapshot: AppSnapshot }): React.JSX.Element {
  const closeSchedules = useViewStore((state) => state.closeSchedules)
  return (
    <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,_1fr)] [container-type:inline-size]">
      <div className="flex items-start gap-[14px] [padding:24px] border-b-[1px] border-b-[color:var(--line-subtle)]">
        <IconButton label="Close scheduled prompts (Esc)" onClick={closeSchedules}>
          <ArrowLeft size={16} />
        </IconButton>
        <div>
          <h1 className="m-0 text-[22px] font-semibold tracking-[-0.015em] leading-[1.25] [font-family:var(--font-display)]">
            Scheduled prompts
          </h1>
          <p className="[margin:6px_0_0] text-[13px] text-[var(--text-secondary)]">
            Manage prompts sent to your threads on a schedule while MeldShell runs.
          </p>
        </div>
      </div>
      <div className="overflow-y-auto min-h-0 [padding:24px] [scrollbar-gutter:stable]">
        <FadeDiv className="w-[min(720px,_100%)] mx-auto">
          <ScheduledPrompts snapshot={snapshot} />
        </FadeDiv>
      </div>
    </main>
  )
}
