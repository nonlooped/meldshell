import { Result, Schema } from "effect"
import {
  PI_CONFIRM_ANSWERS,
  PI_DIALOG_QUESTION,
  PiDialog,
  type ApprovalDecision,
  type UnknownRecord,
} from "@meldshell/contracts"

export const decodeDialog = (record: UnknownRecord): PiDialog | null => {
  const decoded = Schema.decodeUnknownResult(PiDialog)(record)
  return Result.isSuccess(decoded) ? decoded.success : null
}

/**
 * Pi's `extension_ui_response` fields for the user's answer. Declining or dismissing cancels the
 * dialog, which the extension reads as no answer. An answer Pi would not accept throws, leaving
 * the dialog pending.
 */
export const dialogResponse = (
  dialog: PiDialog,
  decision: ApprovalDecision,
  answers: Readonly<Record<string, ReadonlyArray<string>>> | undefined,
): UnknownRecord => {
  if (decision === "decline" || decision === "cancel") return { cancelled: true }
  const answer = answers?.[PI_DIALOG_QUESTION]?.[0] ?? ""
  switch (dialog.method) {
    case "select":
      if (!dialog.options?.includes(answer)) throw new Error("Choose one of the offered options.")
      return { value: answer }
    case "confirm":
      if (answer !== PI_CONFIRM_ANSWERS.yes && answer !== PI_CONFIRM_ANSWERS.no)
        throw new Error(`Answer ${PI_CONFIRM_ANSWERS.yes} or ${PI_CONFIRM_ANSWERS.no}.`)
      return { confirmed: answer === PI_CONFIRM_ANSWERS.yes }
    case "input":
    case "editor":
      return { value: answer }
  }
}
