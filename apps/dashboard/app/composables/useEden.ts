import { treaty } from "@elysiajs/eden"
import type { App } from "@timesheet/server"

export const useEden = () => {
  const config = useRuntimeConfig()
  return treaty<App>(config.public.serverUrl, {
    fetch: {
      credentials: "include",
    },
    // @ts-expect-error bun fetch type error
    fetcher: (url, options) => {
      const headers = useRequestHeaders(["cookie"])
      return fetch(url, {
        ...options,
        headers: new Headers({
          ...options?.headers,
          ...headers,
        }),
      })
    },
  })
}
