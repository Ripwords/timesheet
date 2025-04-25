<script lang="ts" setup>
import type { departmentEnum } from "@timesheet/server"
import type { BadgeProps } from "#ui/types"

const props = defineProps<{
  department: (typeof departmentEnum.enumValues)[number]
}>()

const departmentLabel = computed(() => {
  return props.department.toUpperCase()
})

const badgeColor = computed<BadgeProps["color"]>(() => {
  switch (props.department) {
    case "frontend_design":
      return "info"
    case "frontend_js":
      return "primary"
    case "backend":
      return "success"
    case "uiux":
      return "warning"
    case "digital_marketing":
      return "secondary"
    default:
      return "neutral"
  }
})
</script>

<template>
  <UBadge
    :color="badgeColor"
    variant="subtle"
    >{{ departmentLabel }}</UBadge
  >
</template>
