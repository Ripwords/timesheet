<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui"

const eden = useEden()
const user = await eden.api.auth.profile.get()

const navItems = ref<NavigationMenuItem[][]>([
  [
    {
      label: "Logout",
      icon: "i-lucide-log-out",
      onSelect: async () => {
        await eden.api.auth.signout.post()
        await navigateTo("/auth/login") // Use await
      },
    },
  ],
])

onMounted(async () => {
  navItems.value.unshift(
    user.data?.role === "admin"
      ? [
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
        ]
      : [
          {
            label: "Time Entries",
            icon: "i-lucide-clock",
            to: "/time-entries",
          },
        ]
  )
})
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
