// plugins/eden.ts
import { treaty } from "@elysiajs/eden"
import type { App } from "@timesheet/server"

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()

  const baseURL = config.public.serverUrl

  // Only on server (SSR)
  const headers =
    import.meta.server && nuxtApp.ssrContext?.event?.req?.headers
      ? { cookie: nuxtApp.ssrContext.event.req.headers.cookie || "" }
      : undefined

  const client = treaty<App>(baseURL, {
    fetch: {
      credentials: "include",
    },
    // @ts-expect-error bun fetch type error
    fetcher: (url, options) => {
      return fetch(url, {
        ...options,
        headers: new Headers({
          ...options?.headers,
          ...headers,
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
