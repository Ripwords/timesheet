<script setup lang="ts">
import type { ColumnDef } from "@tanstack/vue-table"
import { UButton } from "#components"
import duration from "dayjs/plugin/duration"
import TimeInput from "~/components/TimeInput.vue"

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
  date: string // Date in YYYY-MM-DD format
  durationSeconds: number
  dateFormatted?: string
  durationFormatted?: string
  description?: string
}

// --- State ---
const startDate = useState("startDate", () =>
  dayjs().subtract(30, "day").format("YYYY-MM-DD")
)
const endDate = useState("endDate", () => dayjs().format("YYYY-MM-DD"))
const isModalOpen = ref(false)
const editingEntry: Ref<TimeEntry | null> = ref(null) // null for 'Add' mode, entry object for 'Edit' mode
const modalTimeInput = ref<string | undefined>(undefined) // For TimeInput component
const isDeleteConfirmOpen = ref(false)
const entryToDeleteId: Ref<string | null> = ref(null)
const isSubmitting = ref(false)
const isDeleting = ref(false) // Separate state for delete operations

// Modal form state
const modalState = reactive({
  id: "",
  date: dayjs().format("YYYY-MM-DD"),
  description: "",
  customDescription: "",
})

// State for default descriptions and threshold
const selectedDefaultDescription = ref<string | undefined>(undefined)

// Projects infinite scroll state
const projectsData = ref<Array<{ id: string; name: string }>>([])
const projectsPage = ref(1)
const projectsLimit = ref(20)
const projectsSearch = ref("")
const projectsLoading = ref(false)
const projectsHasMore = ref(true)
const projectsTotal = ref(0)

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
  await useLazyAsyncData("projects-initial", async () => {
    try {
      const { data, error } = await $eden.api.projects.get({
        query: {
          page: 1,
          limit: 0,
          // limit: projectsLimit.value,
        },
      })

      if (error) {
        toast.add({
          title: "Error fetching projects",
          description: String(error.value),
          color: "error",
        })
        return { projects: [], total: 0 }
      }

      return data || { projects: [], total: 0 }
    } catch (error) {
      console.error(error)
      toast.add({
        title: "Error fetching projects",
        description: "An unexpected error occurred fetching projects.",
        color: "error",
      })
      return { projects: [], total: 0 }
    }
  })

// Initialize projectsData when initialProjects loads
watch(
  initialProjects,
  (newData) => {
    if (newData) {
      projectsData.value = newData.projects || []
      projectsTotal.value = newData.total || 0
      projectsHasMore.value = projectsData.value.length < projectsTotal.value
      projectsPage.value = 2 // Next page to load
    }
  },
  { immediate: true }
)

// Load additional projects for infinite scroll
const loadProjects = async (search = "", reset = false) => {
  if (projectsLoading.value) return

  projectsLoading.value = true

  try {
    const page = reset ? 1 : projectsPage.value
    const { data, error } = await $eden.api.projects.get({
      query: {
        page,
        limit: projectsLimit.value,
        search: search || undefined,
      },
    })

    if (error) {
      toast.add({
        title: "Error fetching projects",
        description: String(error.value),
        color: "error",
      })
      return
    }

    const newProjects =
      data?.projects.map((project) => ({
        id: project.id,
        name: project.name,
      })) || []
    projectsTotal.value = data?.total || 0

    if (reset) {
      projectsData.value = newProjects
      projectsPage.value = 2
    } else {
      projectsData.value.push(...newProjects)
      projectsPage.value++
    }

    projectsHasMore.value = projectsData.value.length < projectsTotal.value
  } catch (error) {
    console.error(error)
    toast.add({
      title: "Error fetching projects",
      description: "An unexpected error occurred fetching projects.",
      color: "error",
    })
  } finally {
    projectsLoading.value = false
  }
}

// Handle search in projects
const handleProjectsSearch = async (query: string) => {
  projectsSearch.value = query
  await loadProjects(query, true)
}

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
  editingEntry.value ? "Edit Time Entry" : "Add Time Entry"
)

const modalDurationFormatted = computed(() => {
  if (!modalTimeInput.value) return "00:00"

  // Parse HH:mm format from TimeInput
  const parts = modalTimeInput.value.split(":")
  if (parts.length !== 2) return "00:00"

  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  if (isNaN(hours) || isNaN(minutes)) return "00:00"

  const totalSeconds = hours * 3600 + minutes * 60
  return formatDuration(totalSeconds)
})

const exceedsDepartmentThresholdInModal = computed(() => {
  if (!modalTimeInput.value) return false

  const parts = modalTimeInput.value.split(":")
  if (parts.length !== 2) return false

  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  if (isNaN(hours) || isNaN(minutes)) return false

  const durationMinutes = hours * 60 + minutes
  const thresholdMinutes = defaultDescriptions.value?.departmentThreshold || 0
  return durationMinutes > thresholdMinutes
})

// --- Helper Functions ---
const parseDurationFromTimeInput = (
  timeStr: string | undefined
): number | null => {
  if (!timeStr) return null

  const parts = timeStr.split(":")
  if (parts.length !== 2) return null

  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  if (isNaN(hours) || isNaN(minutes)) return null

  return hours * 3600 + minutes * 60
}

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

// Determines if the 'Save' button in the modal should be enabled for editing
const canEditEntry = computed(() => {
  if (!editingEntry.value) return true // Always allow saving for new entries

  const entryDate = dayjs(editingEntry.value.date)
  const today = dayjs()
  return entryDate.isSame(today, "day")
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
  if (entry) {
    // Edit mode: Pre-fill form
    modalState.id = entry.projectId
    modalState.date = entry.date
    // Convert duration seconds to HH:mm format for TimeInput
    const hours = Math.floor(entry.durationSeconds / 3600)
    const minutes = Math.floor((entry.durationSeconds % 3600) / 60)
    modalTimeInput.value = `${String(hours).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")}`
    modalState.customDescription = entry.description || ""
    selectedDefaultDescription.value = undefined // Reset selected default

    // Ensure the current project is available in the dropdown even if it's inactive
    const currentProjectExists = projectsData.value.some(
      (p) => p.id === entry.projectId
    )
    if (!currentProjectExists && entry.projectName) {
      // Add the current project to the dropdown options temporarily
      projectsData.value = [
        { id: entry.projectId, name: entry.projectName },
        ...projectsData.value,
      ]
    }
  } else {
    // Add mode: Reset form
    modalState.id = ""
    modalState.date = dayjs().format("YYYY-MM-DD")
    modalState.customDescription = ""
    modalTimeInput.value = undefined // Reset time input
    selectedDefaultDescription.value = undefined // Reset selected default

    // For new entries, reload projects to ensure we only have active projects
    if (initialProjects.value) {
      projectsData.value = initialProjects.value.projects || []
    }
  }
  isModalOpen.value = true
}

const closeModal = () => {
  isModalOpen.value = false
  // Reset potentially dirty form state after modal closes
  editingEntry.value = null
  modalState.id = ""
  modalState.date = ""
  modalState.customDescription = ""
  modalTimeInput.value = undefined
  selectedDefaultDescription.value = undefined
}

const saveEntry = async () => {
  isSubmitting.value = true

  try {
    // 1. Validate inputs
    if (!modalState.id || !modalState.date || !modalTimeInput.value) {
      toast.add({
        title: "Validation Error",
        description: "Project, Date, and Duration are required.",
        color: "warning",
      })
      return
    }

    const date = dayjs(modalState.date)

    if (!date.isValid()) {
      toast.add({
        title: "Validation Error",
        description: "Invalid date format.",
        color: "warning",
      })
      return
    }

    // Validate that time entry is only for today
    const today = dayjs()
    if (!date.isSame(today, "day")) {
      const todayFormatted = today.format("YYYY-MM-DD")
      toast.add({
        title: "Validation Error",
        description: `Time entries can only be submitted for today (${todayFormatted})`,
        color: "warning",
      })
      return
    }

    // 2. Parse duration from TimeInput
    const durationSeconds = parseDurationFromTimeInput(modalTimeInput.value)
    if (durationSeconds === null || durationSeconds <= 0) {
      toast.add({
        title: "Validation Error",
        description: "Please enter a valid duration.",
        color: "warning",
      })
      return
    }

    // 3. Validate description based on department threshold
    let finalDescription = ""
    if (exceedsDepartmentThresholdInModal.value) {
      // If exceeds threshold, custom description is required
      if (
        !modalState.customDescription ||
        modalState.customDescription.trim() === ""
      ) {
        toast.add({
          title: "Validation Error",
          description:
            "A detailed description is required for sessions exceeding your department's threshold.",
          color: "warning",
        })
        return
      }
      finalDescription = modalState.customDescription.trim()
    } else {
      // If doesn't exceed threshold, use custom description or selected default
      finalDescription =
        modalState.customDescription.trim() ||
        selectedDefaultDescription.value ||
        ""

      if (finalDescription === "") {
        toast.add({
          title: "Validation Error",
          description:
            "Description is required. Please select a default description or enter a custom one.",
          color: "warning",
        })
        return
      }
    }

    const payload = {
      projectId: modalState.id,
      date: date.format("YYYY-MM-DD"),
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
        .put(payload)
    } else {
      // Add Mode
      // Call POST endpoint
      result = await $eden.api["time-entries"].post(payload)
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
  if (!entryToDeleteId.value) return

  isDeleting.value = true
  try {
    const result = await $eden.api["time-entries"]
      .id({ id: entryToDeleteId.value })
      .delete()

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
      await refreshEntries() // Refresh the table data
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
                class="w-full [&>[role='listbox']]:z-[60]"
                value-key="id"
                label-key="name"
                placeholder="Select project"
                to="body"
                :items="projectsData || []"
                :loading="loadingProjectsStatus === 'pending'"
                @update:search-term="handleProjectsSearch"
              />
            </UFormField>

            <UFormField
              label="Date"
              name="date"
              required
              class="mb-4"
            >
              <UInput
                v-model="modalState.date"
                type="date"
                :readonly="!editingEntry"
                :disabled="!editingEntry"
              />
              <template #help>
                <span class="text-sm text-gray-500">
                  {{
                    editingEntry
                      ? "You can only edit entries from today"
                      : "New entries can only be created for today"
                  }}
                </span>
              </template>
            </UFormField>

            <UFormField
              label="Duration"
              name="duration"
              required
              class="mb-4"
            >
              <TimeInput v-model="modalTimeInput" />
              <template #help>
                <span class="text-sm text-gray-500">
                  Formatted: {{ modalDurationFormatted }}
                </span>
              </template>
            </UFormField>

            <!-- Description Section -->
            <div class="mb-4">
              <UFormField
                v-if="!exceedsDepartmentThresholdInModal"
                label="Description (Select Default)"
                name="defaultDescription"
                class="mb-2"
              >
                <USelectMenu
                  v-model="selectedDefaultDescription"
                  class="w-full"
                  :items="defaultDescriptions?.defaultDescriptions || []"
                  value-key="description"
                  label-key="description"
                  placeholder="Select a default description"
                  :loading="loadingDefaultsStatus === 'pending'"
                />
              </UFormField>

              <UFormField
                :label="
                  exceedsDepartmentThresholdInModal
                    ? 'Description (Required)'
                    : 'Custom Description (Optional)'
                "
                name="customDescription"
              >
                <UTextarea
                  v-model="modalState.customDescription"
                  class="w-full"
                  :placeholder="
                    exceedsDepartmentThresholdInModal
                      ? 'Please provide a detailed description for this extended session'
                      : 'Enter custom description or leave blank to use selected default'
                  "
                  :required="exceedsDepartmentThresholdInModal"
                />
              </UFormField>

              <p
                v-if="exceedsDepartmentThresholdInModal"
                class="text-sm text-orange-600 dark:text-orange-400 mt-1"
              >
                ⚠️ This session exceeds your department's threshold. A detailed
                description is required.
              </p>
            </div>

            <div class="flex justify-end gap-2">
              <UButton
                type="button"
                variant="outline"
                @click="closeModal"
              >
                Cancel
              </UButton>
              <UButton
                type="submit"
                :loading="isSubmitting"
                :disabled="!canEditEntry"
              >
                {{ editingEntry ? "Update" : "Add" }} Entry
              </UButton>
            </div>
          </UForm>
        </UCard>
      </template>
    </UModal>

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
