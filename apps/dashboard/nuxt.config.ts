// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: true },
  future: {
    compatibilityVersion: 4,
  },
  experimental: {
    typedPages: true,
  },
  devServer: {
    port: 5173,
  },
  runtimeConfig: {
    public: {
      serverUrl: "http://localhost:3100",
    },
  },
  css: ["~/assets/css/main.css"],
  modules: [
    "@nuxt/eslint",
    "@nuxt/fonts",
    "@nuxt/icon",
    "@nuxt/image",
    "@nuxt/ui",
    "dayjs-nuxt",
    "@vueuse/nuxt",
    "@vite-pwa/nuxt",
  ],
})