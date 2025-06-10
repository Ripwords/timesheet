<script setup lang="ts">
import type { ColumnDef } from "@tanstack/vue-table"
import { UButton } from "#components"
import duration from "dayjs/plugin/duration"
import type { TimeEntry } from "~/utils/timeInput"

useSeoMeta({
  title: "Timesheet | Time Entries",
  description: "Time entries for the user",
})

// Composables
const dayjs = useDayjs()
dayjs.extend(duration)

const toast = useToast()
const { $eden } = useNuxtApp()
const { getTimezoneHeaders } = useUserTimezone()

// --- State ---
const startDate = useState("startDate", () =>
  dayjs().subtract(30, "day").format("YYYY-MM-DD")
)
const endDate = useState("endDate", () => dayjs().format("YYYY-MM-DD"))
const isModalOpen = ref(false)
const editingEntry: Ref<TimeEntry | null> = ref(null)
const isDeleteConfirmOpen = ref(false)
const entryToDeleteId: Ref<string | null> = ref(null)
const isDeleting = ref(false)

// --- Data Fetching ---
const {
  data: timeEntries,
  status: loadingEntriesStatus,
  refresh: refreshEntries,
} = await useAsyncData(
  `time-entries-${startDate.value}-${endDate.value}`,
  async () => {
    try {
      const { data, error } = await $eden.api["time-entries"].get({
        query: {
          startDate: startDate.value,
          endDate: endDate.value,
        },
      })

      if (error) {
        toast.add({
          title: "Error fetching time entries",
          description: String(error.value),
          color: "error",
        })
        return []
      }

      return data
    } catch (error) {
      console.error(error)
      toast.add({
        title: "Error fetching time entries",
        description: "An unexpected error occurred fetching entries.",
        color: "error",
      })
      return []
    }
  },
  {
    transform: (data) => {
      return data?.map((entry) => {
        return {
          id: entry.time_entries.id,
          description: entry.time_entries.description || "",
          projectId: entry.time_entries.projectId,
          projectName: entry.projects.name || "Unknown Project",
          date: entry.time_entries.date,
          dateFormatted: dayjs(entry.time_entries.date).format("YYYY-MM-DD"),
          durationSeconds: entry.time_entries.durationSeconds,
          durationFormatted: dayjs
            .duration(entry.time_entries.durationSeconds, "seconds")
            .format("HH:mm:ss"),
        }
      })
    },
  }
)

const { data: initialProjects, status: loadingProjectsStatus } =
  await useLazyAsyncData("projects-for-select", async () => {
    try {
      const { data: projectData } = await $eden.api.projects.get({
        query: { limit: 0 },
      })

      if (!projectData) return []

      return projectData.projects.map((project) => ({
        id: project.id,
        name: project.name,
      }))
    } catch (error) {
      console.error(error)
      toast.add({
        title: "Error fetching projects",
        description: "An unexpected error occurred fetching projects.",
        color: "error",
      })
      return []
    }
  })

const { data: defaultDescriptions, status: loadingDefaultsStatus } =
  await useLazyAsyncData("default-descriptions", async () => {
    const { data: descriptionsData, error } = await $eden.api[
      "time-entries"
    ].defaults.get()
    if (error?.value) {
      console.error("Error fetching default descriptions:", error.value)
      toast.add({
        title: "Error",
        description: "Could not load default descriptions.",
        color: "error",
      })
      return { defaultDescriptions: [], departmentThreshold: undefined }
    }
    return (
      descriptionsData ?? {
        defaultDescriptions: [],
        departmentThreshold: undefined,
      }
    )
  })

// --- Computed ---
const projectsData = computed(() => {
  if (!initialProjects.value) return []

  // If editing, ensure current project is available even if inactive
  if (editingEntry.value) {
    const currentProjectExists = initialProjects.value.some(
      (p) => p.id === editingEntry.value!.projectId
    )
    if (!currentProjectExists) {
      return [
        {
          id: editingEntry.value.projectId,
          name: editingEntry.value.projectName,
        },
        ...initialProjects.value,
      ]
    }
  }

  return initialProjects.value
})

// Table Columns Definition
const columns: ColumnDef<TimeEntry>[] = [
  {
    accessorKey: "projectName",
    header: "Project",
  },
  {
    accessorKey: "dateFormatted",
    header: "Date",
  },
  {
    accessorKey: "durationFormatted",
    header: "Duration",
  },
  {
    accessorKey: "description",
    header: "Description",
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      return h("div", { class: "flex gap-2" }, [
        h(UButton, {
          icon: "i-heroicons-pencil-square",
          size: "xl",
          variant: "outline",
          onClick: () => openModal(row.original),
        }),
        h(UButton, {
          icon: "i-heroicons-trash",
          size: "xl",
          color: "error",
          variant: "outline",
          onClick: () => deleteEntry(row.original.id),
        }),
      ])
    },
  },
]

// --- Methods ---
const openModal = (entry: TimeEntry | null = null) => {
  editingEntry.value = entry
  isModalOpen.value = true
}

const handleModalSaved = async () => {
  await refreshEntries()
}

const deleteEntry = async (id: string) => {
  entryToDeleteId.value = id
  isDeleteConfirmOpen.value = true
}

const confirmDelete = async () => {
  if (!entryToDeleteId.value) return

  isDeleting.value = true
  try {
    const result = await $eden.api["time-entries"]
      .id({ id: entryToDeleteId.value })
      .delete({
        headers: getTimezoneHeaders(),
      })

    if (result?.error) {
      toast.add({
        title: "Error deleting entry",
        description: String(result.error.value),
        color: "error",
      })
    } else {
      toast.add({
        title: "Entry Deleted Successfully",
        color: "success",
      })
      await refreshEntries()
    }
  } catch (e) {
    toast.add({
      title: "API Error",
      description: `An unexpected error occurred. ${e}`,
      color: "error",
    })
  } finally {
    isDeleting.value = false
    isDeleteConfirmOpen.value = false
    entryToDeleteId.value = null
  }
}

// Watch for date range changes to refresh data
watch([startDate, endDate], async () => {
  await refreshEntries()
})
</script>

<template>
  <div>
    <TimeEntryModal
      v-model:is-open="isModalOpen"
      :editing-entry="editingEntry"
      :projects-data="projectsData"
      :default-descriptions="defaultDescriptions?.defaultDescriptions || []"
      :department-threshold="defaultDescriptions?.departmentThreshold"
      :loading-projects="loadingProjectsStatus === 'pending'"
      :loading-defaults="loadingDefaultsStatus === 'pending'"
      @saved="handleModalSaved"
    />

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="isDeleteConfirmOpen">
      <template #header>
        <h2 class="text-lg font-semibold">Confirm Delete</h2>
      </template>

      <template #body>
        <UCard>
          <p class="mb-4">
            Are you sure you want to delete this time entry? This action cannot
            be undone.
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              variant="outline"
              @click="isDeleteConfirmOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              :loading="isDeleting"
              @click="confirmDelete"
            >
              Delete
            </UButton>
          </div>
        </UCard>
      </template>
    </UModal>

    <!-- Main Content -->
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold">Time Entries</h1>
        <UButton
          icon="i-heroicons-plus"
          @click="openModal()"
        >
          Add Entry
        </UButton>
      </div>

      <!-- Date Range Filter -->
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Filter by Date Range</h3>
        </template>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField label="Start Date">
            <UInput
              v-model="startDate"
              type="date"
            />
          </UFormField>
          <UFormField label="End Date">
            <UInput
              v-model="endDate"
              type="date"
            />
          </UFormField>
        </div>
      </UCard>

      <!-- Time Entries Table -->
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Your Time Entries</h3>
        </template>

        <UTable
          :data="timeEntries || []"
          :columns
          :loading="loadingEntriesStatus === 'pending'"
          :empty-state="{
            icon: 'i-heroicons-clock',
            label: 'No time entries found',
            description: 'Add your first time entry to get started.',
          }"
        >
          <template #dateFormatted-data="{ row }">
            {{ dayjs(row.original.date).format("YYYY-MM-DD") }}
          </template>

          <template #actions-data="{ row }">
            <div class="flex gap-2">
              <UButton
                icon="i-heroicons-pencil-square"
                size="sm"
                variant="outline"
                :disabled="
                  !dayjs(row.original.date).isSame(dayjs(), 'day') ||
                  loadingEntriesStatus === 'pending'
                "
                @click="openModal(row.original)"
              >
                Edit
              </UButton>
              <UButton
                icon="i-heroicons-trash"
                size="sm"
                color="error"
                variant="outline"
                :disabled="loadingEntriesStatus === 'pending'"
                @click="deleteEntry(row.original.id)"
              >
                Delete
              </UButton>
            </div>
          </template>
        </UTable>
      </UCard>
    </div>
  </div>
</template>
