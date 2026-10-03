import { LineFramer } from "@meldshell/provider-runtime/line-framer"

/** Strict JSON parsing for the host transport; blank lines carry no message. */
export class JsonLines extends LineFramer {
  constructor(receive: (value: unknown) => void, limit = 32 * 1024 * 1024) {
    super(
      (line) => {
        if (line.trim()) receive(JSON.parse(line))
      },
      limit,
      "Host message exceeded the size limit.",
    )
  }
}
