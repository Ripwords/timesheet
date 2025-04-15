<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui"

const eden = useEden() // Make eden available for logout

const navItems = ref<NavigationMenuItem[][]>([
  [
    {
      label: "Overview",
      icon: "i-lucide-layout-dashboard", // Example icon
      to: "/admin",
    },
    {
      label: "Users",
      icon: "i-lucide-users", // Example icon
      to: "/admin/users",
    },
    {
      label: "Projects",
      icon: "i-lucide-briefcase", // Example icon
      to: "/admin/projects",
    },
  ],
  [
    {
      label: "Logout",
      icon: "i-lucide-log-out",
      onSelect: async () => {
        // Make async
        await eden.api.auth.signout.post()
        await navigateTo("/auth/login") // Use await
      },
    },
  ],
])
</script>

<template>
  <div class="flex flex-col min-h-screen">
    <header
      class="py-4 sticky top-0 z-50 border-b border-gray-200 dark:border-gray-700 bg-background/75 backdrop-blur"
    >
      <UContainer class="flex justify-between items-center">
        <ULink
          to="/"
          class="text-lg font-bold"
          >Timesheet</ULink
        >
        <UNavigationMenu :items="navItems" />
      </UContainer>
    </header>

    <main class="flex-grow">
      <UContainer class="py-8">
        <slot />
      </UContainer>
    </main>
  </div>
</template>
