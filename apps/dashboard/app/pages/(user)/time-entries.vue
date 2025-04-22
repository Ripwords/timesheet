<script setup lang="ts">
import type { ColumnDef, CellContext } from "@tanstack/vue-table"
import { UButton } from "#components"
import duration from "dayjs/plugin/duration"
// Composables
const dayjs = useDayjs()
dayjs.extend(duration)

const toast = useToast()
const eden = useEden()

interface TimeEntry {
  id: number
  projectId: number
  projectName?: string // Added for display
  startTime: string | Date // ISO string from API, Date object in form
  endTime: string | Date // ISO string from API, Date object in form
  durationSeconds: number
  // For display in table
  startTimeFormatted?: string
  endTimeFormatted?: string
  durationFormatted?: string
}

// --- State ---
const isModalOpen = ref(false)
const editingEntry: Ref<TimeEntry | null> = ref(null) // null for 'Add' mode, entry object for 'Edit' mode

// Modal form state
const modalState = reactive({
  projectId: 0,
  startTime: "", // Using string for datetime-local input YYYY-MM-DDTHH:mm
  endTime: "", // Using string for datetime-local input YYYY-MM-DDTHH:mm
  description: "", // Assuming description might be added later
})

// Filtering state (optional for now, can add later)
// const filterStartDate = ref('');
// const filterEndDate = ref('');
// const filterProjectId = ref(undefined);

// --- Data Fetching ---
const {
  data: timeEntries,
  status: loadingEntriesStatus,
  refresh: refreshEntries,
} = await useLazyAsyncData("timeEntries", async () => {
  try {
    const { data, error } = await eden.api["time-entries"].index.get({
      query: {
        startDate: dayjs().subtract(3, "day").toISOString(),
        endDate: dayjs().endOf("day").toISOString(),
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

    return (
      (data?.map((entry) => {
        const project = projects.value?.find(
          (p) => p.id === entry.time_entries.projectId
        )
        return {
          id: entry.time_entries.id,
          projectId: entry.time_entries.projectId,
          projectName: project?.name || "Unknown Project", // Handle missing project
          startTime: entry.time_entries.startTime,
          endTime: entry.time_entries.endTime,
          durationSeconds: entry.time_entries.durationSeconds,
          startTimeFormatted: dayjs(entry.time_entries.startTime).format(
            "YYYY-MM-DD HH:mm"
          ),
          endTimeFormatted: dayjs(entry.time_entries.endTime).format(
            "YYYY-MM-DD HH:mm"
          ),
          durationFormatted:
            dayjs
              .duration(entry.time_entries.durationSeconds, "seconds")
              .format("HH:mm:ss") || "00:00:00",
        }
      }) satisfies TimeEntry[]) || []
    )
  } catch {
    toast.add({
      title: "Error",
      description: "An unexpected error occurred fetching entries.",
      color: "error",
    })
    return []
  }
})

const { data: projects, status: loadingProjectsStatus } = await useAsyncData(
  "projects",
  async () => {
    try {
      const { data, error } = await eden.api.projects.index.get()
      if (error) {
        toast.add({
          title: "Error fetching projects",
          description: String(error.value),
          color: "error",
        })
        return []
      }
      return data?.map((p) => ({ id: p.id, name: p.name })) || []
    } catch {
      toast.add({
        title: "Error",
        description: "An unexpected error occurred fetching projects.",
        color: "error",
      })
      return []
    }
  }
)

// --- Computed ---
const modalTitle = computed(() =>
  editingEntry.value ? "Edit Time Entry" : "Add New Time Entry"
)

const modalDurationFormatted = computed(() => {
  if (modalState.startTime && modalState.endTime) {
    const start = dayjs(modalState.startTime)
    const end = dayjs(modalState.endTime)
    if (start.isValid() && end.isValid() && end.isAfter(start)) {
      const duration = dayjs.duration(end.diff(start))
      return duration.format("HH:mm:ss")
    }
  }
  return "00:00:00"
})

// Determines if the 'Save' button in the modal should be enabled for editing
const canEditEntry = computed(() => {
  if (!editingEntry.value) return true // Always allow saving for new entries

  const entryDate = dayjs(editingEntry.value.startTime)
  const today = dayjs()
  // Allow editing only if the entry's start date is the same day as today
  return entryDate.isSame(today, "day")
})

// Table Columns Definition
const columns: ColumnDef<TimeEntry, unknown>[] = [
  { accessorKey: "projectName", header: "Project" },
  { accessorKey: "startTimeFormatted", header: "Start Time" },
  { accessorKey: "endTimeFormatted", header: "End Time" },
  { accessorKey: "durationFormatted", header: "Duration" },
  {
    id: "actions",
    header: "Actions",
    cell: (context: CellContext<TimeEntry, unknown>) => {
      const entry = context.row.original as TimeEntry
      return h("div", { class: "space-x-2" }, [
        h(UButton, {
          icon: "i-heroicons-pencil-square",
          size: "xs",
          variant: "outline",
          color: "info",
          title: "Edit",
          onClick: () => openModal(entry),
        }),
        h(UButton, {
          icon: "i-heroicons-trash",
          size: "xs",
          variant: "outline",
          color: "error",
          title: "Delete",
          onClick: () => deleteEntry(entry.id),
        }),
      ])
    },
  },
]

// --- Methods ---

const openModal = (entry: TimeEntry | null = null) => {
  editingEntry.value = entry
  if (entry) {
    // Edit mode: Pre-fill form
    modalState.projectId = entry.projectId
    // Format dates for datetime-local input (YYYY-MM-DDTHH:mm)
    modalState.startTime = dayjs(entry.startTime).format("YYYY-MM-DDTHH:mm")
    modalState.endTime = dayjs(entry.endTime).format("YYYY-MM-DDTHH:mm")
    // modalState.description = entry.description || '' // If description exists
  } else {
    // Add mode: Reset form
    modalState.projectId = 0
    modalState.startTime = ""
    modalState.endTime = ""
    modalState.description = ""
  }
  isModalOpen.value = true
}

const closeModal = () => {
  isModalOpen.value = false
  // Reset potentially dirty form state after modal closes
  editingEntry.value = null
  modalState.projectId = 0
  modalState.startTime = ""
  modalState.endTime = ""
  modalState.description = ""
}

const saveEntry = async () => {
  // 1. Validate inputs
  if (!modalState.projectId || !modalState.startTime || !modalState.endTime) {
    toast.add({
      title: "Validation Error",
      description: "Project, Start Time, and End Time are required.",
      color: "warning",
    })
    return
  }

  const start = dayjs(modalState.startTime)
  const end = dayjs(modalState.endTime)

  if (!start.isValid() || !end.isValid()) {
    toast.add({
      title: "Validation Error",
      description: "Invalid date format.",
      color: "warning",
    })
    return
  }

  if (end.isBefore(start)) {
    toast.add({
      title: "Validation Error",
      description: "End Time must be after Start Time.",
      color: "warning",
    })
    return
  }

  // 2. Calculate duration
  const durationSeconds = end.diff(start, "second")

  // 3. Prepare data payload
  const payload = {
    projectId: modalState.projectId,
    startTime: start.toISOString(), // Send ISO string to backend
    endTime: end.toISOString(), // Send ISO string to backend
    durationSeconds: durationSeconds,
    // description: modalState.description // Include if description exists
  }

  try {
    let result
    if (editingEntry.value) {
      // Edit Mode - Check if editing is allowed
      if (!canEditEntry.value) {
        toast.add({
          title: "Edit Restriction",
          description: "You can only edit entries created today.",
          color: "warning",
        })
        return
      }
      // Call PUT endpoint
      result = await eden.api["time-entries"]
        .id({
          id: editingEntry.value.id,
        })
        .put({
          startTime: dayjs(payload.startTime).toDate(),
          endTime: dayjs(payload.endTime).toDate(),
          durationSeconds: payload.durationSeconds,
        })
    } else {
      // Add Mode
      // Call POST endpoint
      result = await eden.api["time-entries"].index.post({
        ...payload,
        startTime: dayjs(payload.startTime).toDate(),
        endTime: dayjs(payload.endTime).toDate(),
      })
    }

    // 4. Handle response
    if (result?.error) {
      toast.add({
        title: `Error ${editingEntry.value ? "updating" : "adding"} entry`,
        description: String(result.error.value),
        color: "error",
      })
    } else {
      toast.add({
        title: `Entry ${editingEntry.value ? "Updated" : "Added"} Successfully`,
        color: "success",
      })
      closeModal()
      await refreshEntries() // Refresh the table data
    }
  } catch (e) {
    toast.add({
      title: "API Error",
      description: `An unexpected error occurred. ${e}`,
      color: "error",
    })
  }
}

const deleteEntry = async (id: number) => {
  // Optional: Add a confirmation dialog here
  if (!confirm("Are you sure you want to delete this time entry?")) {
    return
  }

  try {
    const { error } = await eden.api["time-entries"]
      .id({
        id: id,
      })
      .delete()
    if (error) {
      toast.add({
        title: "Error Deleting Entry",
        description: String(error.value),
        color: "error",
      })
    } else {
      toast.add({ title: "Entry Deleted Successfully", color: "success" })
      await refreshEntries() // Refresh the table data
    }
  } catch (e) {
    toast.add({
      title: "API Error",
      description: `An unexpected error occurred. ${e}`,
      color: "error",
    })
  }
}
</script>

<template>
  <div>
    <!-- Add/Edit Modal -->
    <UModal
      v-model:open="isModalOpen"
      prevent-close
      @close="closeModal"
    >
      <template #header>
        <h2 class="text-lg font-semibold">{{ modalTitle }}</h2>
      </template>

      <template #body>
        <UCard>
          <UForm
            :state="modalState"
            @submit="saveEntry"
          >
            <UFormField
              label="Project"
              name="projectId"
              required
              class="mb-4"
            >
              <USelectMenu
                v-model="modalState.projectId"
                :items="projects"
                value-key="id"
                label-key="name"
                placeholder="Select project"
                searchable
                searchable-placeholder="Search projects..."
                :loading="loadingProjectsStatus === 'pending'"
              />
            </UFormField>

            <UFormField
              label="Start Time"
              name="startTime"
              required
              class="mb-4"
            >
              <UInput
                v-model="modalState.startTime"
                type="datetime-local"
              />
            </UFormField>

            <UFormField
              label="End Time"
              name="endTime"
              required
              class="mb-4"
            >
              <UInput
                v-model="modalState.endTime"
                type="datetime-local"
              />
            </UFormField>

            <div
              label="Duration"
              class="mb-4"
            >
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {{ modalDurationFormatted }} (calculated)
              </p>
            </div>

            <UFormField
              label="Description"
              class="mb-4"
            >
              <UInput
                v-model="modalState.description"
                placeholder="description..."
              />
            </UFormField>
          </UForm>

          <template #footer>
            <div class="flex justify-end gap-3">
              <UButton
                color="neutral"
                variant="ghost"
                @click="closeModal"
                >Cancel</UButton
              >
              <UButton
                :disabled="Boolean(editingEntry) && !canEditEntry"
                :title="
                  editingEntry && !canEditEntry
                    ? 'Can only edit entries from today'
                    : 'Save Entry'
                "
              >
                {{ editingEntry ? "Update Entry" : "Save Entry" }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <h1 class="text-xl font-semibold">Time Entries</h1>
          <UButton
            icon="i-heroicons-plus-circle"
            size="sm"
            @click="openModal(null)"
            >Add Entry</UButton
          >
        </div>
        <!-- Add Filtering Controls Here Later -->
      </template>

      <UTable
        :columns="columns"
        :data="timeEntries"
        :loading="loadingEntriesStatus === 'pending'"
        :empty-state="{
          icon: 'i-heroicons-clock',
          label: 'No time entries found.',
        }"
      >
        <template #actions-data="{ row }">
          <div class="flex gap-2">
            <UButton
              icon="i-heroicons-pencil-square"
              size="xs"
              variant="outline"
              color="info"
              title="Edit (only allowed for today's entries)"
              :disabled="!dayjs(row.original.startTime).isSame(dayjs(), 'day')"
              @click="openModal(row.original)"
            />
            <UButton
              icon="i-heroicons-trash"
              size="xs"
              variant="outline"
              color="error"
              title="Delete Entry"
              @click="deleteEntry(row.original.id)"
            />
          </div>
        </template>

        <!-- Formatting for specific columns if needed -->
        <template #startTimeFormatted-data="{ row }">
          {{ dayjs(row.original.startTime).format("YYYY-MM-DD HH:mm") }}
        </template>
        <template #endTimeFormatted-data="{ row }">
          {{ dayjs(row.original.endTime).format("YYYY-MM-DD HH:mm") }}
        </template>
        <template #durationFormatted-data="{ row }">
          {{
            dayjs
              .duration(row.original.durationSeconds, "seconds")
              .format("HH:mm:ss")
          }}
        </template>
      </UTable>
    </UCard>
  </div>
</template>
