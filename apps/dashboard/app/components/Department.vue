<script lang="ts" setup>
const props = defineProps<{
  departmentId: string
}>()

const { $eden } = useNuxtApp()

const { data: departments } = useAsyncData(`departments`, async () => {
  const { data } = await $eden.api.admin.departments.get({
    query: {},
  })
  return data
})

const departmentLabel = computed(() => {
  return departments.value?.find((d) => d.id === props.departmentId)?.name
})
</script>

<template>
  <UBadge
    :color="
      departments?.find((d) => d.id === props.departmentId)?.color ?? 'neutral'
    "
    variant="subtle"
    >{{ departmentLabel }}</UBadge
  >
</template>
