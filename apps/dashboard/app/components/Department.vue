<script lang="ts" setup>
const props = defineProps<{
  departmentId: string
}>()

const { $eden } = useNuxtApp()

const { data: departments } = useAsyncData(
  `department-${props.departmentId}`,
  async () => {
    const { data } = await $eden.api.admin.departments.index.get({
      query: {
        departmentIds: [props.departmentId],
      },
    })
    return data?.[0]
  },
  {
    watch: [() => props.departmentId],
  }
)

const departmentLabel = computed(() => {
  return departments.value?.departmentName
})
</script>

<template>
  <UBadge
    :color="departments?.departmentColor ?? 'neutral'"
    variant="subtle"
    >{{ departmentLabel }}</UBadge
  >
</template>
