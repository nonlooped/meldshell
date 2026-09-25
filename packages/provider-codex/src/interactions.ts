import Ajv from "ajv"
import { Schema, Either } from "effect"
import type { ApprovalDecision } from "@meldshell/contracts"
import commandSchema from "../schema/CommandExecutionRequestApprovalResponse.json"
import fileSchema from "../schema/FileChangeRequestApprovalResponse.json"
import inputSchema from "../schema/ToolRequestUserInputResponse.json"
import permissionsSchema from "../schema/PermissionsRequestApprovalResponse.json"

const ajv = new Ajv({ strict: false, validateFormats: false })
const validators = {
  "item/commandExecution/requestApproval": ajv.compile(commandSchema),
  "item/fileChange/requestApproval": ajv.compile(fileSchema),
  "item/tool/requestUserInput": ajv.compile(inputSchema),
  "item/permissions/requestApproval": ajv.compile(permissionsSchema),
}

export const encodeInteractionResponse = (
  method: string,
  params: unknown,
  decision: ApprovalDecision,
  answers?: Readonly<Record<string, ReadonlyArray<string>>>,
): unknown => {
  const request = interactionParams(params)
  let response: unknown
  switch (method) {
    case "item/commandExecution/requestApproval":
    case "item/fileChange/requestApproval":
      response = { decision }
      break
    case "item/tool/requestUserInput": {
      const accepted = decision === "accept"
      const result: Record<string, { answers: ReadonlyArray<string> }> = {}
      if (accepted) Object.assign(result, userAnswers(request.questions, answers))
      else if (decision === "acceptForSession")
        throw new Error("User input cannot be approved for a session.")
      response = { answers: result }
      break
    }
    case "item/permissions/requestApproval":
      response = {
        permissions:
          decision === "accept" || decision === "acceptForSession" ? request.permissions : {},
        scope: decision === "acceptForSession" ? "session" : "turn",
      }
      break
    default:
      throw new Error(`Unsupported interaction method: ${method}`)
  }
  const validate = validators[method as keyof typeof validators]
  if (!validate(response))
    throw new Error(`Invalid interaction response: ${ajv.errorsText(validate.errors)}`)
  return response
}

const interactionParams = (params: unknown) => {
  const decoded = Schema.decodeUnknownEither(
    Schema.Struct({
      questions: Schema.optional(Schema.Array(Schema.Struct({ id: Schema.String }))),
      permissions: Schema.optional(Schema.Unknown),
    }),
  )(params)
  if (Either.isLeft(decoded))
    throw new Error(`Invalid interaction request: ${decoded.left.message}`)
  return decoded.right
}

const userAnswers = (
  questions: ReadonlyArray<{ readonly id: string }> | undefined,
  answers: Readonly<Record<string, ReadonlyArray<string>>> | undefined,
) => {
  if (!questions) throw new Error("Missing interaction questions.")
  return Object.fromEntries(
    questions.map((question) => {
      const answer = answers?.[question.id]
      if (answer === undefined || answer.length === 0 || answer.some((text) => !text.trim()))
        throw new Error("Answer every question before submitting.")
      return [question.id, { answers: answer }]
    }),
  )
}
