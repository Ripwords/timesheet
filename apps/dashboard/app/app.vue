<script lang="ts" setup>
const config = useRuntimeConfig()
const { umamiUrl, umamiId } = config.public

onMounted(() => {
  if (umamiId !== "" && umamiUrl !== "" && import.meta.client) {
    useScript({
      src: umamiUrl,
      defer: true,
      ["data-website-id"]: umamiId,
    })
  }
})
</script>

<template>
  <NuxtPwaAssets />
  <UApp>
    <NuxtLayout>
      <NuxtRouteAnnouncer />
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
