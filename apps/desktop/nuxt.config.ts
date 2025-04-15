// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: false },
  experimental: {
    typedPages: true,
  },
  future: {
    compatibilityVersion: 4,
  },
  ssr: false,
  vite: {
    // Better support for Tauri CLI output
    clearScreen: false,
    // Enable environment variables
    // Additional environment variables can be found at
    envPrefix: ["VITE_", "TAURI_"],
    server: {
      // Tauri requires a consistent port
      strictPort: true,
      watch: {
        ignored: ["**/src-tauri/**"],
        usePolling: true,
      },
    },
  },
  runtimeConfig: {
    public: {
      serverUrl: "",
    },
  },
  css: ["~/assets/css/main.css"],
  dayjs: {
    locales: ["en"],
    plugins: ["relativeTime", "utc", "localizedFormat", "duration"],
    defaultLocale: "en",
  },
  modules: ["@nuxt/ui", "dayjs-nuxt", "@vueuse/nuxt"],
})
