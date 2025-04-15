import { treaty } from "@elysiajs/eden"
import type { App } from "@timesheet/server"

export const useEden = () => {
  const config = useRuntimeConfig()
  return treaty<App>(config.public.serverUrl, {
    fetch: {
      credentials: "include",
    },
  })
}
