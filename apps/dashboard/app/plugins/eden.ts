// plugins/eden.ts
import { treaty } from "@elysiajs/eden"
import type { App } from "@timesheet/server"

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const baseURL = config.public.serverUrl

  const client = treaty<App>(baseURL, {
    fetch: {
      credentials: "include",
    },
    // @ts-expect-error bun fetch type error
    fetcher: (url, options) => {
      const headersFromNuxt = import.meta.server
        ? useRequestHeaders(["cookie"])
        : undefined

      return fetch(url, {
        ...options,
        credentials: "include",
        headers: new Headers({
          ...options?.headers,
          ...headersFromNuxt,
        }),
      })
    },
  })

  return {
    provide: {
      eden: client,
    },
  }
})
