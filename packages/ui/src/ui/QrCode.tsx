import { useMemo } from "react"
import { encode } from "uqr"

/**
 * A QR code on a white tile. Phone cameras read dark modules on a light ground most reliably, so
 * the tile ignores the theme, and the tile's padding is the quiet zone the symbol needs.
 */
export function QrCode({
  value,
  label,
  size = 152,
  className = "",
}: {
  readonly value: string
  readonly label: string
  readonly size?: number
  readonly className?: string
}): React.JSX.Element {
  const { path, modules } = useMemo(() => {
    const code = encode(value, { ecc: "M", border: 0 })
    const segments: string[] = []
    code.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) segments.push(`M${x} ${y}h1v1h-1z`)
      }),
    )
    return { path: segments.join(""), modules: code.size }
  }, [value])
  return (
    <span
      className={`inline-grid flex-none place-items-center rounded-[var(--radius-lg)] bg-white p-[12px] ${className}`}
    >
      <svg
        viewBox={`0 0 ${modules} ${modules}`}
        width={size}
        height={size}
        role="img"
        aria-label={label}
        shapeRendering="crispEdges"
      >
        <path d={path} fill="#111" />
      </svg>
    </span>
  )
}
