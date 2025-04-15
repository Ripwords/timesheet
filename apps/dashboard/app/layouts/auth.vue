<template>
  <div class="flex flex-col min-h-screen">
    <header
      class="py-4 fixed w-full top-0 z-50 border-b border-gray-200 dark:border-gray-700"
    >
      <UContainer class="flex justify-between items-center">
        <ULink
          to="/"
          class="text-lg font-bold"
          >Timesheet</ULink
        >
      </UContainer>
    </header>

    <main>
      <slot />
    </main>
  </div>
</template>
