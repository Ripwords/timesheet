<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui"

const { $eden } = useNuxtApp()
const route = useRoute()

// 1. Fetch user data ONCE using useAsyncData
// This runs on the server, and the result is passed to the client for hydration.
const {
  data: user,
  status,
  error,
  refresh,
} = await useAsyncData(
  "userData", // Unique key
  () => $eden.api.auth.profile.get().then((res) => res.data)
)

// 2. Use a regular `computed` based on the fetched user data
const navItems = computed<NavigationMenuItem[][]>(() => {
  // Handle loading/error states if desired
  if (
    status.value === "pending" ||
    error.value ||
    !user.value ||
    route.path.startsWith("/auth")
  ) {
    return []
  }

  const isAdmin = user.value.role === "admin"
  const defaultItems = [
    {
      label: "Logout",
      icon: "i-lucide-log-out",
      onSelect: async () => {
        await $eden.api.auth.signout.post()
        await navigateTo("/auth/login")
      },
    },
  ]

  if (isAdmin) {
    return [
      [
        { label: "Overview", icon: "i-lucide-layout-dashboard", to: "/admin" },
        { label: "Users", icon: "i-lucide-users", to: "/admin/users" },
        {
          label: "Departments",
          icon: "i-lucide-building",
          to: "/admin/departments",
        },
        {
          label: "Projects",
          icon: "i-lucide-briefcase",
          to: "/admin/projects",
        },
        {
          label: "Settings",
          icon: "i-lucide-settings",
          to: "/admin/settings",
        },
      ],
      defaultItems,
    ]
  }

  // No need to check role === 'user' again if not admin, assuming only two roles
  // or adjust logic if more roles exist
  return [
    [
      { label: "Time Entries", icon: "i-lucide-clock", to: "/time-entries" },
      // { label: "Projects", icon: "i-lucide-folder-kanban", to: "/projects" },
      // { label: "Profile", icon: "i-lucide-user-cog", to: "/profile" },
    ],
    defaultItems,
  ]
})

watch(route, () => {
  refresh()
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
        <!-- Conditionally render or show loading state -->
        <UNavigationMenu
          v-if="status === 'success' && user"
          :items="navItems"
        />
        <UNavigationMenu v-else />
        <!-- Or a skeleton loader -->
      </UContainer>
    </header>

    <main class="flex-grow">
      <UContainer class="py-8">
        <slot />
      </UContainer>
    </main>
  </div>
</template>
