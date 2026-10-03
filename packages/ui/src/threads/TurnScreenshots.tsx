import type { CanonicalEvent } from "@meldshell/contracts"
import { Globe } from "lucide-react"
import { useMemo, useState } from "react"
import { ImageContextMenu } from "../ui/ImageContextMenu"
import { ImageLightbox } from "../ui/MarkdownBlocks"
import { turnImages } from "./tool-details"

/** Thumbnails shown before the rest collapse into a count on the last one. */
const VISIBLE = 4

/**
 * The screenshots and other images a turn's tools returned, shown with the reply so the user sees
 * what the agent saw without opening the working log.
 */
export function TurnScreenshots({ events }: { readonly events: readonly CanonicalEvent[] }) {
  const images = useMemo(() => turnImages(events), [events])
  const [index, setIndex] = useState<number>()
  if (images.length === 0) return null
  const single = images.length === 1
  const shown = images.slice(0, VISIBLE)
  const hidden = images.length - shown.length
  return (
    <div
      className="turn-screenshots mt-[12px] flex flex-wrap gap-[10px]"
      role="group"
      aria-label={
        single ? "Screenshot from this turn" : `${images.length} screenshots from this turn`
      }
    >
      {shown.map((image, i) => {
        const more = i === shown.length - 1 && hidden > 0
        return (
          <figure key={image.src} className={single ? singleClasses : thumbnailClasses}>
            <ImageContextMenu
              source={image.src}
              name={image.alt}
              onEnlarge={() => setIndex(i)}
              trigger={
                <button
                  type="button"
                  className={`motion-colors ${frameClasses}`}
                  aria-label={
                    more ? `Show all ${images.length} screenshots` : `Enlarge ${image.alt}`
                  }
                  onClick={() => setIndex(i)}
                >
                  <img src={image.src} alt={image.alt} loading="lazy" decoding="async" />
                  {more && <span className={moreClasses}>+{hidden}</span>}
                </button>
              }
            />
            <figcaption title={image.alt}>
              <Globe size={11} strokeWidth={1.75} aria-hidden="true" />
              <span>{image.alt}</span>
            </figcaption>
          </figure>
        )
      })}
      {index !== undefined && (
        <ImageLightbox
          images={images}
          index={index}
          onClose={() => setIndex(undefined)}
          onIndex={setIndex}
        />
      )}
    </div>
  )
}

const figureBase = [
  "m-0 min-w-0 flex flex-col gap-[6px]",
  "[&_figcaption]:flex [&_figcaption]:items-center [&_figcaption]:gap-[5px] [&_figcaption]:min-w-0",
  "[&_figcaption]:text-[var(--text-tertiary)] [&_figcaption]:text-[11px] [&_figcaption_svg]:flex-none",
  "[&_figcaption_span]:min-w-0 [&_figcaption_span]:overflow-hidden [&_figcaption_span]:text-ellipsis",
  "[&_figcaption_span]:whitespace-nowrap",
].join(" ")

const singleClasses = `${figureBase} max-w-[min(100%,_560px)] [&_img]:max-h-[360px] [&_img]:w-auto [&_img]:max-w-full`

const thumbnailClasses = `${figureBase} w-[208px] [&_img]:h-[117px] [&_img]:w-full [&_img]:object-cover [&_img]:object-top`

const frameClasses = [
  "relative block p-0 overflow-hidden border-[1px] border-[color:var(--line)] rounded-[var(--radius)]",
  "bg-[var(--surface-hover)] cursor-zoom-in shadow-[0_1px_2px_rgb(0_0_0_/_0.12)]",
  "[&:hover]:border-[color:var(--line-strong)] [&_img]:block",
  "[&:focus-visible]:[outline:1.5px_solid_var(--focus-ring)] [&:focus-visible]:[outline-offset:2px]",
].join(" ")

const moreClasses = [
  "absolute inset-0 grid place-items-center bg-[rgb(0_0_0_/_0.55)] text-white",
  "text-[15px] font-semibold [font-variant-numeric:tabular-nums]",
].join(" ")
