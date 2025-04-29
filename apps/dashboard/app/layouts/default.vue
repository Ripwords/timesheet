<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui"

const eden = useEden()
let user = await eden.api.auth.profile.get().then((res) => res.data)

const route = useRoute()

const navItems = computedAsync<NavigationMenuItem[][]>(async () => {
  if (route.path.startsWith("/auth")) {
    return []
  }

  user = await eden.api.auth.profile.get().then((res) => res.data)
  const isAdmin = user?.role === "admin"
  const defaultItems = [
    {
      label: "Logout",
      icon: "i-lucide-log-out",
      onSelect: async () => {
        await eden.api.auth.signout.post()
        await navigateTo("/auth/login") // Use await
      },
    },
  ]

  if (isAdmin) {
    return [
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
      defaultItems,
    ]
  }

  if (user && user.role === "user") {
    return [
      [
        {
          label: "Time Entries",
          icon: "i-lucide-clock",
          to: "/time-entries",
        },
      ],
      defaultItems,
    ]
  }

  return []
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
