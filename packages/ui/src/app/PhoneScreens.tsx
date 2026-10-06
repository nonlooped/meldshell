import { usePhoneNav, type PhoneScreen } from "./phone-nav"

const order: readonly PhoneScreen[] = ["inbox", "main", "files", "file"]

/**
 * A phone's screens stacked in one place. The one in front fills the window; a deeper screen
 * slides in over it from the right and back out again, as a phone's own apps do. Screens stay
 * mounted, so a thread keeps its scroll position and draft while the inbox is in front.
 */
export function PhoneScreens({
  screens,
}: {
  readonly screens: Readonly<Record<PhoneScreen, React.ReactNode>>
}): React.JSX.Element {
  const screen = usePhoneNav((state) => state.screen)
  const front = order.indexOf(screen)
  return (
    <div className="relative grid min-h-0 min-w-0 overflow-hidden [grid-template-areas:'screen']">
      {order.map((name, index) => {
        const place = index === front ? "front" : index < front ? "behind" : "ahead"
        return (
          <section
            key={name}
            aria-label={labels[name]}
            data-phone-screen={name}
            data-place={place}
            inert={place !== "front"}
            className={screenClasses}
          >
            {screens[name]}
          </section>
        )
      })}
    </div>
  )
}

const labels: Readonly<Record<PhoneScreen, string>> = {
  inbox: "Inbox",
  main: "Thread",
  files: "Files and changes",
  file: "File",
}

const screenClasses = [
  "relative grid min-h-0 min-w-0 [grid-area:screen] bg-[var(--scrim)]",
  "[--slide:calc(320ms_*_var(--motion-scale,_1))]",
  "[transition-property:transform,opacity,visibility] [transition-duration:var(--slide)]",
  "[transition-timing-function:cubic-bezier(0.2,_0.8,_0.2,_1)]",
  "data-[place=front]:z-[1] data-[place=front]:[transition-delay:0s]",
  // Off-screen screens hide once they have slid away, so nothing behind is painted or focused.
  "data-[place=behind]:invisible data-[place=behind]:opacity-0",
  "data-[place=behind]:[transform:translateX(-24%)]",
  "data-[place=ahead]:invisible data-[place=ahead]:z-[2] data-[place=ahead]:[transform:translateX(100%)]",
  "data-[place=behind]:[transition-delay:0s,0s,var(--slide)]",
  "data-[place=ahead]:[transition-delay:0s,0s,var(--slide)]",
].join(" ")
