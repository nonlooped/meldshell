import type { CanonicalEvent } from "@meldshell/contracts"
import { useMemo } from "react"
import { ImageGallery } from "../ui/MarkdownBlocks"
import { turnImages } from "./tool-details"

/** The images a turn's tools returned, captioned beside the reply. */
export function TurnScreenshots({ events }: { readonly events: readonly CanonicalEvent[] }) {
  const images = useMemo(() => turnImages(events), [events])
  return images.length === 0 ? null : <ImageGallery images={images} screenshots />
}
