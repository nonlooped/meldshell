import { StringDecoder } from "node:string_decoder"

/** Bounded framing, including chunks split in the middle of a UTF-8 character. */
export class JsonLines {
  private readonly decoder = new StringDecoder("utf8")
  private pending = ""
  constructor(
    private readonly receive: (value: unknown) => void,
    private readonly limit = 32 * 1024 * 1024,
  ) {}

  push(chunk: Buffer): void {
    this.pending += this.decoder.write(chunk)
    let end: number
    while ((end = this.pending.indexOf("\n")) >= 0) {
      const line = this.pending.slice(0, end)
      this.pending = this.pending.slice(end + 1)
      if (Buffer.byteLength(line) > this.limit)
        throw new Error("Host message exceeded the size limit.")
      if (line.trim()) this.receive(JSON.parse(line))
    }
    if (Buffer.byteLength(this.pending) > this.limit)
      throw new Error("Host message exceeded the size limit.")
  }
}
