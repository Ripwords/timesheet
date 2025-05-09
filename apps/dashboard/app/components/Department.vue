<script lang="ts" setup>
const props = defineProps<{
  departmentId: string
}>()

const { $eden } = useNuxtApp()

const { data: departments } = useAsyncData(
  `department-${props.departmentId}`,
  async () => {
    const { data } = await $eden.api.admin.departments.get({
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
  return departments.value?.name
})
</script>

<template>
  <UBadge
    :color="departments?.color ?? 'neutral'"
    variant="subtle"
    >{{ departmentLabel }}</UBadge
  >
</template>
