<script lang="ts" setup>
const props = defineProps<{
  departmentId: number
}>()

const eden = useEden()

const { data: departments } = useAsyncData(
  `department-${props.departmentId}`,
  async () => {
    const { data } = await eden.api.admin.departments.index.get({
      query: {
        departmentIds: [props.departmentId],
      },
    })
    return data
  },
  {
    watch: [() => props.departmentId],
  }
)

type Color =
  | "info"
  | "error"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "neutral"

const color = computed<Color>(() => {
  switch (departments.value?.[0]?.id) {
    case 1:
      return "info"
    case 2:
      return "error"
    case 3:
      return "primary"
    case 4:
      return "secondary"
    case 5:
      return "success"
    default:
      return "neutral"
  }
})

const departmentLabel = computed(() => {
  return departments.value?.[0]?.departmentName
})
</script>

<template>
  <UBadge
    :color
    variant="subtle"
    >{{ departmentLabel }}</UBadge
  >
</template>
