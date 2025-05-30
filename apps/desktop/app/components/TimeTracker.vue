<script setup lang="ts">
import type { TableColumn } from "#ui/types"

const dayjs = useDayjs()
const toast = useToast()
const eden = useEden()
const logout = async () => {
  await eden.api.auth.signout.post()
  navigateTo("/login")
}
const auth = useCookie("auth")

// --- State ---
const timerInterval = ref<NodeJS.Timeout | null>(null)
const timerStatus = ref<"stopped" | "running" | "paused">("stopped")
const startTime = ref<number | null>(null) // Timestamp of the *very first* start after stopped
const intervalStartTime = ref<number | null>(null) // Timestamp of the start of the current running interval (start or resume)
const totalAccumulatedDuration = ref(0) // Seconds accumulated before the current running interval
const currentIntervalElapsedTime = ref(0) // Seconds elapsed in the current running interval
const showProjectModal = ref(false)
const finalSessionDuration = ref(0) // Store final duration when stopping
const selectedProjectId = ref<string>()
const timeEntryDescription = ref("")

// --- Load Initial Timer State ---
await useLazyAsyncData("timer-initial-state", async () => {
  const { data: timerData, error } = await eden.api["time-tracker"].active.get()

  if (error?.value) {
    console.error("Error loading timer state:", error.value)
    return null
  }

  if (timerData?.hasActiveSession && timerData.session) {
    const session = timerData.session

    // Restore timer state from server
    timerStatus.value = session.status
    startTime.value = new Date(session.startTime).getTime()
    totalAccumulatedDuration.value = session.totalAccumulatedDuration

    if (session.status === "running" && session.lastIntervalStartTime) {
      intervalStartTime.value = new Date(
        session.lastIntervalStartTime
      ).getTime()
      // Start the display timer to show real-time updates
      nextTick(() => {
        startDisplayTimer()
      })
    } else {
      // Paused state
      currentIntervalElapsedTime.value = 0
      intervalStartTime.value = null
    }

    // Restore description if it exists
    if (session.description) {
      timeEntryDescription.value = session.description
    }

    toast.add({
      title: "Timer Restored",
      description: `Found active ${session.status} timer session`,
      color: "info",
    })

    return session
  }

  return null
})

// Separate function for just the display timer (UI updates)
const startDisplayTimer = () => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
  }

  timerInterval.value = setInterval(() => {
    if (intervalStartTime.value && timerStatus.value === "running") {
      currentIntervalElapsedTime.value = dayjs().diff(
        dayjs(intervalStartTime.value),
        "second"
      )
    }
  }, 1000)
}

// --- Projects ---
const { data: projects } = await useLazyAsyncData("projects", async () => {
  const { data: projectData } = await eden.api.projects.get({
    query: {},
  })
  return projectData?.projects.map((project) => ({
    id: project.id,
    name: project.name,
  }))
})

// --- History ---
const { data: history, refresh: refreshHistory } = await useLazyAsyncData(
  async () => {
    const { data: timeEntryData } = await eden.api["time-entries"].get({
      query: {
        startDate: dayjs().subtract(3, "day").format("YYYY-MM-DD"),
        endDate: dayjs().format("YYYY-MM-DD"),
      },
    })

    return timeEntryData?.map((entry) => ({
      project: entry.projects.name,
      date: dayjs(entry.time_entries.date).format("YYYY-MM-DD"),
      durationFormatted:
        dayjs
          .duration(entry.time_entries.durationSeconds, "seconds")
          .humanize() || "0 seconds",
    }))
  }
)

// --- Default Descriptions ---
const { data: defaultDescriptions } = await useLazyAsyncData(
  `default-descriptions-${auth.value}`,
  async () => {
    const { data: descriptionsData, error } = await eden.api[
      "time-entries"
    ].defaults.get()
    if (error) {
      console.error("Error fetching default descriptions:", error.value)
      toast.add({
        title: "Error",
        description: "Could not load default descriptions.",
        color: "error",
      })
      return {
        defaultDescriptions: [],
        departmentThreshold: undefined,
      } // Return empty array on error
    }
    return descriptionsData || []
  }
)

// --- Computed ---
const formattedElapsedTime = computed(() => {
  const totalSeconds =
    totalAccumulatedDuration.value + currentIntervalElapsedTime.value
  const duration = dayjs.duration(totalSeconds, "seconds")
  return `${String(Math.floor(duration.asHours())).padStart(2, "0")}:${String(
    duration.minutes()
  ).padStart(2, "0")}:${String(duration.seconds()).padStart(2, "0")}`
})

const exceedsDepartmentThreshold = computed(() => {
  const threshold = defaultDescriptions?.value?.departmentThreshold
  return typeof threshold === "number" && finalSessionDuration.value > threshold
})

// --- Custom description logic ---
const customDescription = ref("")
const dropdownDescription = ref("")

watch(
  [exceedsDepartmentThreshold, customDescription, dropdownDescription],
  ([exceeds, custom, dropdown]) => {
    if (exceeds) {
      timeEntryDescription.value = custom
    } else {
      timeEntryDescription.value = custom || dropdown
    }
  }
)

watch(
  () => showProjectModal.value,
  (open) => {
    if (open) {
      customDescription.value = ""
      dropdownDescription.value = ""
    }
  }
)

// Define columns using accessorKey and header, explicitly typed
const historyColumns: TableColumn<{
  project: string
  date: string
  durationFormatted: string
}>[] = [
  { accessorKey: "project", header: "Project" },
  { accessorKey: "date", header: "Date" },
  { accessorKey: "durationFormatted", header: "Duration" },
]

// --- Methods ---
const resetState = () => {
  // Reset all timer state
  timerStatus.value = "stopped"
  startTime.value = null
  intervalStartTime.value = null
  totalAccumulatedDuration.value = 0
  currentIntervalElapsedTime.value = 0
  selectedProjectId.value = undefined
  timeEntryDescription.value = ""
  finalSessionDuration.value = 0

  // Clear display timer
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
    timerInterval.value = null
  }

  refreshHistory()
}

const startTimer = async () => {
  if (timerStatus.value === "running") return

  try {
    const { data: response, error } = await eden.api[
      "time-tracker"
    ].start.post()

    if (error?.value) {
      console.error("Error starting timer:", error.value)
      toast.add({
        title: "Error",
        description: "Failed to start timer session",
        color: "error",
      })
      return
    }

    if (response) {
      const session = response.session

      // Update local state based on server response
      timerStatus.value = session.status
      startTime.value = new Date(session.startTime).getTime()
      totalAccumulatedDuration.value = session.totalAccumulatedDuration

      if (session.lastIntervalStartTime) {
        intervalStartTime.value = new Date(
          session.lastIntervalStartTime
        ).getTime()
      }

      // Start display timer
      startDisplayTimer()

      if (response.action === "resumed") {
        toast.add({
          title: "Timer Resumed",
          description: "Continuing your previous session",
          color: "success",
        })
      } else if (response.action === "started") {
        toast.add({
          title: "Timer Started",
          description: "New timer session begun",
          color: "success",
        })
      }
    }
  } catch (e) {
    console.error("Failed to start timer:", e)
    toast.add({
      title: "Error",
      description: "An unexpected error occurred",
      color: "error",
    })
  }
}

const pauseTimer = async () => {
  if (timerStatus.value !== "running") return

  try {
    const { data: response, error } = await eden.api[
      "time-tracker"
    ].pause.post()

    if (error?.value) {
      console.error("Error pausing timer:", error.value)
      toast.add({
        title: "Error",
        description: "Failed to pause timer session",
        color: "error",
      })
      return
    }

    if (response) {
      // Update local state based on server response
      timerStatus.value = "paused"
      totalAccumulatedDuration.value = response.totalElapsed
      currentIntervalElapsedTime.value = 0
      intervalStartTime.value = null

      // Stop display timer
      if (timerInterval.value) {
        clearInterval(timerInterval.value)
        timerInterval.value = null
      }

      toast.add({
        title: "Timer Paused",
        description: `Total time: ${dayjs
          .duration(response.totalElapsed, "seconds")
          .humanize()}`,
        color: "info",
      })
    }
  } catch (e) {
    console.error("Failed to pause timer:", e)
    toast.add({
      title: "Error",
      description: "An unexpected error occurred",
      color: "error",
    })
  }
}

const endTimer = async () => {
  if (timerStatus.value === "stopped") return

  try {
    const { data: response, error } = await eden.api[
      "time-tracker"
    ].active.delete()

    if (error?.value) {
      console.error("Error ending timer:", error.value)
      toast.add({
        title: "Error",
        description: "Failed to end timer session",
        color: "error",
      })
      return
    }

    if (response && response.finalDuration > 0) {
      // Store final duration for the modal
      finalSessionDuration.value = response.finalDuration
      startTime.value = new Date(response.startTime).getTime() // Keep for modal save logic

      // Reset display state but keep final data for modal
      timerStatus.value = "stopped"
      intervalStartTime.value = null
      totalAccumulatedDuration.value = 0
      currentIntervalElapsedTime.value = 0

      // Stop display timer
      if (timerInterval.value) {
        clearInterval(timerInterval.value)
        timerInterval.value = null
      }

      // Show project selection modal
      showProjectModal.value = true
    } else {
      // No time elapsed, fully reset
      resetState()
      toast.add({
        title: "Timer Ended",
        description: "No time was recorded",
        color: "info",
      })
    }
  } catch (e) {
    console.error("Failed to end timer:", e)
    toast.add({
      title: "Error",
      description: "An unexpected error occurred",
      color: "error",
    })
  }
}

const saveSession = async () => {
  // Use selectedProjectId now
  if (!selectedProjectId.value || !startTime.value) {
    showProjectModal.value = false // Close modal even on error
    resetState()
    return
  }

  // Prepare data for API - now using date instead of startTime/endTime
  const timeEntryData = {
    projectId: selectedProjectId.value,
    date: dayjs(startTime.value).format("YYYY-MM-DD"), // Use the date when the session started
    durationSeconds: finalSessionDuration.value,
    description: timeEntryDescription.value || undefined,
  }

  try {
    // Call the API endpoint
    const { data: savedEntry, error } = await eden.api["time-entries"].post(
      timeEntryData
    )

    if (error) {
      toast.add({
        title: "Error saving session",
        description: String(error.value),
      })
    } else if (savedEntry) {
      toast.add({ title: "Session Saved!" })
    }
  } catch (e) {
    toast.add({ title: "Error", description: "An unexpected error occurred." })
  }

  // Reset state and close modal regardless of success or failure
  showProjectModal.value = false
  resetState()
}

const cancelSession = () => {
  showProjectModal.value = false
  resetState()
}
</script>

<template>
  <div>
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="text-lg font-semibold">Time Tracker</h3>
          <UButton
            icon="i-heroicons-arrow-left-on-rectangle"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="logout"
          >
            Logout
          </UButton>
        </div>
      </template>

      <div
        class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
      >
        <div class="text-2xl font-mono">
          {{ formattedElapsedTime }}
        </div>
        <div class="flex gap-2">
          <UButton
            icon="i-heroicons-play"
            size="lg"
            variant="solid"
            :disabled="timerStatus === 'running'"
            @click="startTimer"
          >
            {{ timerStatus === "paused" ? "Resume" : "Start" }}
          </UButton>
          <UButton
            icon="i-heroicons-pause"
            size="lg"
            color="warning"
            variant="solid"
            :disabled="timerStatus !== 'running'"
            @click="pauseTimer"
          >
            Pause
          </UButton>
          <UButton
            icon="i-heroicons-stop-circle"
            size="lg"
            color="error"
            variant="solid"
            :disabled="timerStatus === 'stopped'"
            @click="endTimer"
          >
            End
          </UButton>
        </div>
      </div>

      <div class="p-4">
        <h4 class="text-md font-semibold mb-2">
          Recent Sessions (Last 3 Days)
        </h4>
        <UTable
          :data="history"
          :columns="historyColumns"
          :empty-state="{
            icon: 'i-heroicons-clock',
            label: 'No recent sessions.',
          }"
        />
      </div>
    </UCard>
    <UModal
      v-model:open="showProjectModal"
      @update:open="resetState"
    >
      <template #header>
        <h3 class="text-lg font-semibold">Save Session</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Duration:
          {{ dayjs.duration(finalSessionDuration, "seconds").humanize() }}
        </p>
      </template>

      <template #body>
        <div class="flex flex-col gap-2">
          <USelectMenu
            v-model="selectedProjectId"
            :items="projects"
            label-key="name"
            value-key="id"
            placeholder="Select project"
            searchable
            searchable-placeholder="Search projects..."
          />
          <div>
            <label class="block text-sm font-medium mb-1">Description</label>
            <template v-if="exceedsDepartmentThreshold">
              <UInput
                v-model="customDescription"
                placeholder="Enter description..."
                color="primary"
                variant="outline"
                class="w-full"
                required
              />
              <p class="text-xs text-warning mt-1">
                A custom description is required for long sessions.
              </p>
            </template>
            <template v-else>
              <USelectMenu
                v-model="dropdownDescription"
                :items="defaultDescriptions?.defaultDescriptions"
                label-key="description"
                value-key="description"
                placeholder="Select or type description..."
                creatable
                searchable
                searchable-placeholder="Search or add description..."
                class="mb-2"
              />
              <UInput
                v-model="customDescription"
                placeholder="Or enter a custom description..."
                color="primary"
                variant="outline"
                class="w-full"
              />
              <p class="text-xs text-gray-500 mt-1">
                You can select a description or enter your own. If you type a
                custom description, it will be used.
              </p>
            </template>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="cancelSession"
            >Cancel</UButton
          >
          <UButton
            :disabled="
              !selectedProjectId ||
              (exceedsDepartmentThreshold && !customDescription)
            "
            @click="saveSession"
            >Save Session</UButton
          >
        </div>
      </template>
    </UModal>
  </div>
</template>
