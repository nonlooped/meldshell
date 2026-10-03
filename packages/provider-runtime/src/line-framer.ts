/** Bounded LF framing. Decode only complete lines so split UTF-8 characters stay intact. */
export class LineFramer {
  private chunks: Buffer[] = []
  private size = 0

  constructor(
    private readonly receive: (line: string) => void,
    private readonly limit: number,
    private readonly limitMessage: string,
  ) {}

  push(chunk: Buffer) {
    let start = 0
    for (let end = chunk.indexOf(10); end !== -1; end = chunk.indexOf(10, start)) {
      const tail = chunk.subarray(start, end)
      this.checkSize(tail.length)
      const bytes = this.size === 0 ? tail : Buffer.concat([...this.chunks, tail])
      this.chunks = []
      this.size = 0
      const line = bytes.toString("utf8")
      this.receive(line.endsWith("\r") ? line.slice(0, -1) : line)
      start = end + 1
    }
    if (start < chunk.length) {
      const tail = chunk.subarray(start)
      this.checkSize(tail.length)
      this.chunks.push(tail)
      this.size += tail.length
    }
  }

  private checkSize(additional: number) {
    if (this.size + additional > this.limit) throw new Error(this.limitMessage)
  }
}
