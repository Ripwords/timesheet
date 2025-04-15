import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import { treaty } from "@elysiajs/eden"
import type { App } from "@timesheet/server"

export const useEden = () => {
  const appConfig = useAppConfig()
  const eden = treaty<App>(appConfig.serverUrl, {
    // @ts-ignore
    fetcher(url, options) {
      return tauriFetch(url, options as any)
    },
  })

  return eden
}
