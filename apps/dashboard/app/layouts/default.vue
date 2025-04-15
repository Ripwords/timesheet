<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui"

const navItems = ref<NavigationMenuItem[]>([
  {
    label: "Logout",
    icon: "i-lucide-log-out",
    onSelect: () => {
      useEden().auth.signout.post()
      navigateTo("/auth/login")
    },
  },
])
</script>

<template>
  <div class="flex flex-col min-h-screen">
    <header
      class="py-4 sticky top-0 z-50 border-b border-gray-200 dark:border-gray-700"
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
