<script setup lang="ts">
import duration from "dayjs/plugin/duration"
import {
  formatDuration,
  parseDurationFromTimeInput,
  type TimeEntry,
} from "~/utils/timeInput"

interface Props {
  editingEntry?: TimeEntry | null
  departmentThreshold?: number
  projectsData: { id: string; name: string | undefined }[]
  defaultDescriptions: { description: string }[]
  loadingProjects?: boolean
  loadingDefaults?: boolean
  isAdmin?: boolean
}

interface Emits {
  (e: "saved"): void
}

const props = withDefaults(defineProps<Props>(), {
  editingEntry: null,
  departmentThreshold: 0,
  loadingProjects: false,
  loadingDefaults: false,
  isAdmin: false,
})

const emit = defineEmits<Emits>()

const dayjs = useDayjs()
dayjs.extend(duration)

const toast = useToast()
const { $eden } = useNuxtApp()
const { getTimezoneHeaders } = useUserTimezone()
const isSubmitting = ref(false)
const modalTimeInput = ref<string | undefined>(undefined)
const selectedDefaultDescription = ref<string | undefined>(undefined)

const modalState = reactive({
  id: "",
  date: dayjs().format("YYYY-MM-DD"),
  description: "",
  customDescription: "",
})

// Computed property for project selection
const selectedProjectId = computed({
  get: () => modalState.id,
  set: (value) => {
    modalState.id = value
    console.log("TimeEntryModal: selectedProjectId set to:", value)
  },
})

// Computed properties
const modalTitle = computed(() =>
  props.editingEntry ? "Edit Time Entry" : "Add Time Entry"
)

const exceedsDepartmentThresholdInModal = computed(() => {
  if (!modalTimeInput.value) return false

  const parts = modalTimeInput.value.split(":")
  if (parts.length !== 2) return false

  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  if (isNaN(hours) || isNaN(minutes)) return false

  const durationMinutes = hours * 60 + minutes
  const thresholdMinutes = props.departmentThreshold || 0
  return durationMinutes > thresholdMinutes
})

const modalDurationFormatted = computed(() => {
  if (!modalTimeInput.value) return "00:00"

  const parts = modalTimeInput.value.split(":")
  if (parts.length !== 2) return "00:00"

  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  if (isNaN(hours) || isNaN(minutes)) return "00:00"

  const totalSeconds = hours * 3600 + minutes * 60
  return formatDuration(totalSeconds)
})

const canEditEntry = computed(() => {
  if (props.isAdmin) return true
  if (!props.editingEntry) return true

  const entryDate = dayjs(props.editingEntry.date)
  const today = dayjs()
  return entryDate.isSame(today, "day")
})

// Watch for editingEntry changes to populate form
watch(
  () => props.editingEntry,
  (entry) => {
    console.log("TimeEntryModal: editingEntry changed:", entry) // Debug log
    if (entry) {
      // Edit mode: Pre-fill form
      console.log("TimeEntryModal: Setting form data for edit:", {
        projectId: entry.projectId,
        date: entry.date,
        durationSeconds: entry.durationSeconds,
        description: entry.description,
      }) // Debug log
      console.log("TimeEntryModal: Available projects:", props.projectsData) // Debug log
      console.log("TimeEntryModal: Looking for project ID:", entry.projectId) // Debug log
      console.log(
        "TimeEntryModal: Available project IDs:",
        props.projectsData?.map((p) => p.id)
      ) // Debug log
      modalState.id = entry.projectId
      modalState.date = entry.date
      // Convert duration seconds to HH:mm format for TimeInput
      const hours = Math.floor(entry.durationSeconds / 3600)
      const minutes = Math.floor((entry.durationSeconds % 3600) / 60)
      modalTimeInput.value = `${String(hours).padStart(2, "0")}:${String(
        minutes
      ).padStart(2, "0")}`
      modalState.customDescription = entry.description || ""
      selectedDefaultDescription.value = undefined
      console.log("TimeEntryModal: modalState after setting:", modalState) // Debug log
    } else {
      // Add mode: Reset form
      // Default to first project if available (for admin adding new entries)
      modalState.id =
        props.projectsData &&
        props.projectsData.length > 0 &&
        props.projectsData[0]
          ? props.projectsData[0].id
          : ""
      modalState.date = dayjs().format("YYYY-MM-DD")
      modalState.customDescription = ""
      modalTimeInput.value = undefined
      selectedDefaultDescription.value = undefined
    }
  },
  { immediate: true }
)

// Watch modalState.id changes
watch(
  () => modalState.id,
  (newId) => {
    console.log("TimeEntryModal: modalState.id changed to:", newId)
  }
)

const isOpen = defineModel<boolean>("isOpen", { required: true })

// Watch for modal close to reset form
watch(isOpen, (isOpen) => {
  if (!isOpen) {
    // Reset form when modal closes
    modalState.id = ""
    modalState.date = dayjs().format("YYYY-MM-DD")
    modalState.customDescription = ""
    modalTimeInput.value = undefined
    selectedDefaultDescription.value = undefined
  }
})

const closeModal = () => {
  isOpen.value = false
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

    // Validate that time entry is only for today (unless admin)
    if (!props.isAdmin) {
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
    if (props.editingEntry) {
      // Edit Mode - Check if editing is allowed (unless admin)
      if (!props.isAdmin && !canEditEntry.value) {
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
          id: props.editingEntry.id,
        })
        .put(payload, {
          headers: getTimezoneHeaders(),
        })
    } else {
      // Add Mode
      // Call POST endpoint
      result = await $eden.api["time-entries"].post(payload, {
        headers: getTimezoneHeaders(),
      })
    }

    // 4. Handle response
    if (result?.error) {
      toast.add({
        title: `Error ${props.editingEntry ? "updating" : "adding"} entry`,
        description: String(result.error.value),
        color: "error",
      })
    } else {
      toast.add({
        title: `Entry ${props.editingEntry ? "Updated" : "Added"} Successfully`,
        color: "success",
      })
      emit("saved")
      closeModal()
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
</script>

<template>
  <UModal
    v-model:open="isOpen"
    prevent-close
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
              v-model="selectedProjectId"
              :items="projectsData || []"
              class="w-full [&>[role='listbox']]:z-[60]"
              value-key="id"
              label-key="name"
              placeholder="Select project"
              to="body"
              :loading="loadingProjects"
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
              :readonly="!props.isAdmin"
              :disabled="!props.isAdmin"
            />
            <template #help>
              <span class="text-sm text-gray-500">
                {{
                  props.isAdmin
                    ? "Admins can select any date for time entries"
                    : "Time entries can only be submitted for today"
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
                :items="defaultDescriptions || []"
                value-key="description"
                label-key="description"
                placeholder="Select a default description"
                :loading="loadingDefaults"
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
              {{ props.editingEntry ? "Update" : "Add" }} Entry
            </UButton>
          </div>
        </UForm>
      </UCard>
    </template>
  </UModal>
</template>
