<script setup lang="ts">
definePageMeta({
  middleware: "admin",
})

useSeoMeta({
  title: "Timesheet | Admin Departments",
  description: "Manage departments in the application",
})

const { $eden } = useNuxtApp()
const toast = useToast()

const page = ref(1)
const search = ref("")

const {
  data: departmentsData,
  status,
  refresh,
} = await useLazyAsyncData(
  "admin-departments",
  async () => {
    const { data, error } = await $eden.api.admin.departments.get({ query: {} })
    if (error) {
      toast.add({
        title: "Error fetching departments",
        description: String(error.value),
        color: "error",
      })
      return { departments: [], total: 0 }
    }
    return {
      departments: data,
      total: data?.length ?? 0,
    }
  },
  {
    watch: [page], // Watch page for potential future use with API pagination
  }
)

watchDebounced(
  search,
  async () => {
    page.value = 1 // Reset to first page on search
    await refresh()
  },
  { debounce: 300 }
)
</script>

<template>
  <div></div>
</template>
