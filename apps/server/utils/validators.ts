import { t } from "elysia"

export const UUID = t.String({
  format: "uuid",
  error: "Invalid Project ID format",
})
