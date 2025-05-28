<script setup lang="ts">
import type { ColumnDef, CellContext } from "@tanstack/vue-table"
import { UButton } from "#components"
import duration from "dayjs/plugin/duration"

useSeoMeta({
  title: "Timesheet | Time Entries",
  description: "Time entries for the user",
})

// Composables
const dayjs = useDayjs()
dayjs.extend(duration)

const toast = useToast()
const { $eden } = useNuxtApp()

interface TimeEntry {
  id: string
  projectId: string
  projectName?: string // Added for display
  startTime: string | Date // ISO string from API, Date object in form
  endTime: string | Date // ISO string from API, Date object in form
  durationSeconds: number
  startTimeFormatted?: string
  endTimeFormatted?: string
  durationFormatted?: string
  description?: string
}

// --- State ---
const startDate = useState("startDate", () =>
  dayjs().subtract(30, "day").toISOString()
)
const endDate = useState("endDate", () => dayjs().endOf("day").toISOString())
const isModalOpen = ref(false)
const editingEntry: Ref<TimeEntry | null> = ref(null) // null for 'Add' mode, entry object for 'Edit' mode
const modalDurationInput = ref("") // For the duration input field (e.g., "1h 30m")
const isDeleteConfirmOpen = ref(false)
const entryToDeleteId: Ref<string | null> = ref(null)
const isSubmitting = ref(false)
const isDeleting = ref(false) // Separate state for delete operations

// Modal form state
const modalState = reactive({
  id: "",
  startTime: dayjs().format("YYYY-MM-DDTHH:mm"),
  endTime: dayjs().format("YYYY-MM-DDTHH:mm"),
  description: "",
  customDescription: "",
})

// State for default descriptions and threshold
const selectedDefaultDescription = ref<string | undefined>(undefined)

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
          startTime: entry.time_entries.startTime,
          startTimeFormatted: dayjs(entry.time_entries.startTime).format(
            "YYYY-MM-DD HH:mm"
          ),
          endTime: entry.time_entries.endTime,
          endTimeFormatted: dayjs(entry.time_entries.endTime).format(
            "YYYY-MM-DD HH:mm"
          ),
          durationSeconds: entry.time_entries.durationSeconds,
          durationFormatted: dayjs
            .duration(entry.time_entries.durationSeconds, "seconds")
            .format("HH:mm:ss"),
        }
      })
    },
  }
)

const { data: projects, status: loadingProjectsStatus } = await useAsyncData(
  "projects",
  async () => {
    try {
      const { data, error } = await $eden.api.projects.get({
        query: {
          limit: 0,
        },
      })
      if (error) {
        toast.add({
          title: "Error fetching projects",
          description: String(error.value),
          color: "error",
        })
        return []
      }

      return data?.projects.map((p) => ({ id: p.id, name: p.name })) || []
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

// Fetch Default Descriptions
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
      // Return the expected structure even on error
      return { defaultDescriptions: [], departmentThreshold: undefined }
    }
    // Ensure the structure matches expectations, providing defaults if null/undefined
    return (
      descriptionsData ?? {
        defaultDescriptions: [],
        departmentThreshold: undefined,
      }
    )
  })

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
      return duration.format("HH:mm")
    }
  }
  return "00:00"
})

// Helper to parse duration strings "HH:mm" into seconds
const parseDurationString = (durationStr: string): number | null => {
  if (!durationStr || typeof durationStr !== "string") return null

  const parts = durationStr.split(":")
  if (parts.length !== 2) return null // Expecting HH:mm

  const hourPart = parts[0]
  const minutePart = parts[1]

  if (hourPart === undefined || minutePart === undefined) return null

  const hours = parseInt(hourPart, 10)
  const minutes = parseInt(minutePart, 10)

  if (
    isNaN(hours) ||
    isNaN(minutes) ||
    hours < 0 ||
    minutes < 0 ||
    minutes >= 60
  ) {
    return null // Invalid numbers or minutes out of range
  }

  return hours * 3600 + minutes * 60
}

// Computed property to check if current modal entry duration exceeds threshold
const exceedsDepartmentThresholdInModal = computed(() => {
  if (defaultDescriptions.value?.departmentThreshold === undefined) return false // No threshold set
  const durationSeconds = parseDurationString(modalDurationInput.value)
  if (durationSeconds === null) return false

  return durationSeconds / 60 >= defaultDescriptions.value?.departmentThreshold
})

// Helper to format duration in seconds to "HH:mm" string
const formatDuration = (totalSeconds: number): string => {
  if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0)
    return "00:00"
  const d = dayjs.duration(totalSeconds, "seconds")
  // Note: dayjs duration format doesn't directly handle total hours > 24 well for HH:mm.
  // We calculate total hours manually.
  const totalHours = Math.floor(d.asHours())
  const minutes = d.minutes()

  const hoursStr = String(totalHours).padStart(2, "0")
  const minutesStr =
    typeof minutes === "number" && !isNaN(minutes)
      ? String(minutes).padStart(2, "0")
      : "00"

  return `${hoursStr}:${minutesStr}`
}

// Watch the duration input field
watch(modalDurationInput, (newDurationStr) => {
  if (!modalState.startTime) return // Need start time to calculate end time

  const start = dayjs(modalState.startTime)
  if (!start.isValid()) return

  const durationSeconds = parseDurationString(newDurationStr)

  if (durationSeconds !== null && durationSeconds >= 0) {
    const newEndTime = start.add(durationSeconds, "second")
    // Update endTime only if it's different to avoid loops
    const currentEndTimeFormatted = dayjs(modalState.endTime).format(
      "YYYY-MM-DDTHH:mm:ss"
    ) // Use seconds for precision
    const newEndTimeFormatted = newEndTime.format("YYYY-MM-DDTHH:mm:ss")

    if (newEndTimeFormatted !== currentEndTimeFormatted) {
      modalState.endTime = newEndTime.format("YYYY-MM-DDTHH:mm") // Update the model for the input
    }
  }
})

// Watch startTime and endTime to update the duration input
watch(
  [() => modalState.startTime, () => modalState.endTime],
  ([newStartTime, newEndTime]) => {
    if (newStartTime && newEndTime) {
      const start = dayjs(newStartTime)
      const end = dayjs(newEndTime)

      if (start.isValid() && end.isValid() && end.isAfter(start)) {
        const durationSeconds = end.diff(start, "second")
        const formattedDuration = formatDuration(durationSeconds)

        // Update duration input only if it's different to avoid loops
        const currentInputDurationSeconds = parseDurationString(
          modalDurationInput.value
        )
        if (durationSeconds !== currentInputDurationSeconds) {
          modalDurationInput.value = formattedDuration
        }
      } else {
        // Reset duration input if dates are invalid or end is not after start
        modalDurationInput.value = ""
      }
    } else {
      modalDurationInput.value = ""
    }
  },
  { deep: true } // Necessary because we are watching properties of a reactive object
)

// Determines if the 'Save' button in the modal should be enabled for editing
const canEditEntry = computed(() => {
  if (!editingEntry.value) return true // Always allow saving for new entries

  const entryDate = dayjs(editingEntry.value.startTime)
  const today = dayjs()
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
          size: "xl",
          variant: "outline",
          color: "info",
          title: "Edit",
          onClick: () => openModal(entry),
        }),
        h(UButton, {
          icon: "i-heroicons-trash",
          size: "xl",
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
    modalState.id = entry.projectId
    // Format dates for datetime-local input (YYYY-MM-DDTHH:mm)
    modalState.startTime = dayjs(entry.startTime).format("YYYY-MM-DDTHH:mm")
    modalState.endTime = dayjs(entry.endTime).format("YYYY-MM-DDTHH:mm")
    // Calculate and format initial duration for the input field
    const initialDurationSeconds = dayjs(entry.endTime).diff(
      dayjs(entry.startTime),
      "second"
    )
    modalDurationInput.value = formatDuration(initialDurationSeconds)
    modalState.customDescription = entry.description || ""
    selectedDefaultDescription.value = undefined // Reset selected default
  } else {
    // Add mode: Reset form
    modalState.id = ""
    modalState.startTime = dayjs().format("YYYY-MM-DDTHH:mm")
    modalState.endTime = dayjs().format("YYYY-MM-DDTHH:mm")
    modalState.customDescription = ""
    modalDurationInput.value = "00:00" // Reset duration input
    selectedDefaultDescription.value = undefined // Reset selected default
  }
  isModalOpen.value = true
}

const closeModal = () => {
  isModalOpen.value = false
  // Reset potentially dirty form state after modal closes
  editingEntry.value = null
  modalState.id = ""
  modalState.startTime = ""
  modalState.endTime = ""
  modalState.customDescription = ""
  selectedDefaultDescription.value = undefined
}

const saveEntry = async () => {
  isSubmitting.value = true

  try {
    // 1. Validate inputs
    if (!modalState.id || !modalState.startTime || !modalState.endTime) {
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

    // Validate that time entry is not older than 11:59PM of the previous day
    const cutoffTime = dayjs().subtract(1, "day").endOf("day")
    if (start.isBefore(cutoffTime)) {
      const cutoffFormatted = cutoffTime.format("YYYY-MM-DD HH:mm:ss")
      toast.add({
        title: "Validation Error",
        description: `Time entries cannot be submitted for dates before ${cutoffFormatted}`,
        color: "warning",
      })
      return
    }

    // 2. Calculate duration
    const durationSeconds = end.diff(start, "second")

    // 3. Prepare data payload
    let finalDescription = ""
    if (exceedsDepartmentThresholdInModal.value) {
      finalDescription = modalState.customDescription
    } else {
      finalDescription =
        modalState.customDescription || selectedDefaultDescription.value || ""
    }

    if (finalDescription === "") {
      toast.add({
        title: "Validation Error",
        description: "Description is required.",
        color: "warning",
      })
      return
    }

    const payload = {
      projectId: modalState.id,
      startTime: start.toISOString(), // Send ISO string to backend
      endTime: end.toISOString(), // Send ISO string to backend
      durationSeconds: durationSeconds,
      description: finalDescription,
    }

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
      result = await $eden.api["time-entries"]
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
      result = await $eden.api["time-entries"].post({
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
  } finally {
    isSubmitting.value = false
  }
}

const deleteEntry = async (id: string) => {
  entryToDeleteId.value = id
  isDeleteConfirmOpen.value = true
}

const confirmDelete = async () => {
  isDeleting.value = true
  if (!entryToDeleteId.value) return

  try {
    const { error } = await $eden.api["time-entries"]
      .id({
        id: entryToDeleteId.value,
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
  } finally {
    isDeleteConfirmOpen.value = false
    entryToDeleteId.value = null
    isDeleting.value = false
  }
}

const cancelDelete = () => {
  isDeleteConfirmOpen.value = false
  entryToDeleteId.value = null
  isDeleting.value = false // Reset delete loading state
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
                v-model="modalState.id"
                class="w-full"
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
              label="Duration (Calculated)"
              class="mb-4"
            >
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {{ modalDurationFormatted }} (calculated from start/end time)
              </p>
            </div>

            <UFormField
              label="Set Duration"
              name="durationInput"
              class="mb-4"
            >
              <TimeInput v-model="modalDurationInput" />
            </UFormField>

            <UFormField
              label="Description"
              class="mb-4 w-full"
            >
              <template v-if="exceedsDepartmentThresholdInModal">
                <UInput
                  v-model="modalState.customDescription"
                  class="w-full"
                  placeholder="Enter description (required for long session)..."
                  required
                />
                <p class="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  A custom description is required as the session exceeds the
                  threshold ({{
                    defaultDescriptions?.departmentThreshold
                      ? dayjs
                          .duration(
                            defaultDescriptions.departmentThreshold,
                            "seconds"
                          )
                          .humanize()
                      : "N/A"
                  }}).
                </p>
              </template>
              <template v-else>
                <USelectMenu
                  v-model="selectedDefaultDescription"
                  :items="
                    defaultDescriptions?.defaultDescriptions?.map(
                      (d) => d.description
                    ) ?? []
                  "
                  placeholder="Select common task or type custom..."
                  creatable
                  searchable
                  searchable-placeholder="Search or add description..."
                  class="mb-2 w-full"
                  :loading="loadingDefaultsStatus === 'pending'"
                />
                <UInput
                  v-model="modalState.customDescription"
                  class="w-full"
                  placeholder="Or enter a custom description..."
                />
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Select a common task or type a custom description. Custom
                  input overrides selection.
                </p>
              </template>
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
                :disabled="
                  (Boolean(editingEntry) && !canEditEntry) || isSubmitting
                "
                :title="
                  editingEntry && !canEditEntry
                    ? 'Can only edit entries from today'
                    : 'Save Entry'
                "
                @click="saveEntry"
              >
                {{ editingEntry ? "Update Entry" : "Save Entry" }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal
      v-model:open="isDeleteConfirmOpen"
      prevent-close
      @close="cancelDelete"
    >
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">Confirm Deletion</h2>
          </template>

          <p class="mb-4">
            Are you sure you want to delete this time entry? This action cannot
            be undone.
          </p>

          <template #footer>
            <div class="flex justify-end gap-3">
              <UButton
                color="neutral"
                variant="ghost"
                @click="cancelDelete"
                >Cancel</UButton
              >
              <UButton
                :disabled="isDeleting"
                color="error"
                @click="confirmDelete"
                >Delete Entry</UButton
              >
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
      </template>

      <UTable
        :columns
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
              :disabled="
                !dayjs(row.original.startTime).isSame(dayjs(), 'day') ||
                isDeleting
              "
              @click="openModal(row.original)"
            />
            <UButton
              icon="i-heroicons-trash"
              size="xs"
              variant="outline"
              color="error"
              title="Delete Entry"
              :disabled="isDeleting"
              :loading="isDeleting && entryToDeleteId === row.original.id"
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
