export type Chime = "done" | "attention" | "failed"

// Soft sine bells: rising for done, a repeated note for attention, falling for failure.
const notes: Record<Chime, ReadonlyArray<readonly [frequency: number, delay: number]>> = {
  done: [
    [659.25, 0],
    [987.77, 0.11],
  ],
  attention: [
    [880, 0],
    [880, 0.16],
  ],
  failed: [
    [587.33, 0],
    [440, 0.13],
  ],
}

let context: AudioContext | null = null

/** Plays a short synthesized chime. Audio failures never affect the thread flow. */
export function playChime(chime: Chime): void {
  try {
    context ??= new AudioContext()
    const now = context.currentTime
    for (const [frequency, delay] of notes[chime]) {
      const start = now + delay
      const gain = context.createGain()
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.07, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6)
      gain.connect(context.destination)
      // A quiet octave partial gives the sine a bell-like edge.
      for (const [multiple, level] of [
        [1, 1],
        [2, 0.18],
      ] as const) {
        const oscillator = context.createOscillator()
        const partial = context.createGain()
        oscillator.frequency.value = frequency * multiple
        partial.gain.value = level
        oscillator.connect(partial).connect(gain)
        oscillator.start(start)
        oscillator.stop(start + 0.62)
      }
    }
  } catch {
    // No audio device or a suspended context: stay silent.
  }
}
