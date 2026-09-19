/** Presentation only: provider IDs and saved display names remain unchanged. */
export const modelLabel = (name: string): string =>
  name
    .replace(/\[[^\]]*\]/g, "")
    .replace(/(\d)[-_](?=\d(?:\D|$))/g, "$1.")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z][a-z0-9]*\b/g, (word) =>
      word === "gpt" ? "GPT" : word[0]!.toUpperCase() + word.slice(1),
    )
