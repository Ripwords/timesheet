<script setup lang="ts">
import type { TableColumn } from "#ui/types"

const dayjs = useDayjs()
const toast = useToast()
const eden = useEden()
const logout = async () => {
  await eden.api.auth.signout.post()
  navigateTo("/login")
}

// --- State ---
const timerInterval = ref<NodeJS.Timeout | null>(null)
const timerStatus = ref<"stopped" | "running" | "paused">("stopped")
const startTime = ref<number | null>(null) // Timestamp of the *very first* start after stopped
const intervalStartTime = ref<number | null>(null) // Timestamp of the start of the current running interval (start or resume)
const totalAccumulatedDuration = ref<number>(0) // Seconds accumulated before the current running interval
const currentIntervalElapsedTime = ref<number>(0) // Seconds elapsed in the current running interval
const showProjectModal = ref(false)
const finalSessionDuration = ref(0) // Store final duration when stopping

// --- Projects ---
const selectedProjectId = ref<number>()
const { data: projects } = await useLazyAsyncData("projects", async () => {
  const { data: projectData } = await eden.api.projects.index.get()
  return projectData?.map((project) => ({ id: project.id, name: project.name }))
})

console.log(projects.value)

// --- History ---
const { data: history, refresh: refreshHistory } = await useLazyAsyncData(
  async () => {
    const { data: timeEntryData } = await eden.api["time-entries"].index.get({
      query: {
        startDate: dayjs().subtract(3, "day").toISOString(),
        endDate: dayjs().toISOString(),
      },
    })

    return timeEntryData?.map((entry) => ({
      project: entry.projects.name,
      startTimeFormatted: dayjs(entry.time_entries.startTime).format("LL"),
      endTimeFormatted: dayjs(entry.time_entries.endTime).format("LL"),
      durationFormatted:
        dayjs
          .duration(entry.time_entries.durationSeconds, "seconds")
          .humanize() || "0 seconds",
    }))
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

// Define columns using accessorKey and header, explicitly typed
const historyColumns: TableColumn<{
  project: string
  startTimeFormatted: string
  endTimeFormatted: string
  durationFormatted: string
}>[] = [
  { accessorKey: "project", header: "Project" },
  { accessorKey: "startTimeFormatted", header: "Start Time" },
  { accessorKey: "endTimeFormatted", header: "End Time" },
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
  refreshHistory()
}

const startTimer = () => {
  if (timerStatus.value === "running") return

  const now = Date.now()
  intervalStartTime.value = now // Mark the start of this interval

  if (timerStatus.value === "stopped") {
    startTime.value = now // Set the overall start time
    totalAccumulatedDuration.value = 0 // Reset accumulated duration
    currentIntervalElapsedTime.value = 0 // Reset current interval time
  }
  // If resuming from pause, totalAccumulatedDuration already holds the prior time

  timerStatus.value = "running"
  timerInterval.value = setInterval(() => {
    if (intervalStartTime.value) {
      // Calculate elapsed time for *this* interval
      currentIntervalElapsedTime.value = dayjs().diff(
        dayjs(intervalStartTime.value),
        "second"
      )
    }
  }, 1000)
}

const pauseTimer = () => {
  if (
    timerStatus.value !== "running" ||
    !timerInterval.value ||
    !intervalStartTime.value
  )
    return

  clearInterval(timerInterval.value)
  timerInterval.value = null

  // Calculate duration of the interval that just ended and add it to the total
  const durationThisInterval = dayjs().diff(
    dayjs(intervalStartTime.value),
    "second"
  )
  totalAccumulatedDuration.value += durationThisInterval

  currentIntervalElapsedTime.value = 0 // Reset current interval timer
  intervalStartTime.value = null // Clear interval start time
  timerStatus.value = "paused"
}

const endTimer = () => {
  if (timerStatus.value === "stopped") return

  const endTime = Date.now()
  const originalStartTimeForSave = startTime.value // Keep for saving
  const statusBeforeStop = timerStatus.value

  if (timerInterval.value) {
    clearInterval(timerInterval.value)
    timerInterval.value = null
  }

  // Calculate final duration
  let finalDuration = totalAccumulatedDuration.value
  if (statusBeforeStop === "running" && intervalStartTime.value) {
    // If it was running, add the elapsed time from the final interval
    finalDuration += dayjs(endTime).diff(
      dayjs(intervalStartTime.value),
      "second"
    )
  }
  // If it was paused, totalAccumulatedDuration already has the correct total

  finalSessionDuration.value = finalDuration
  resetState()

  // Show modal only if time elapsed
  if (finalSessionDuration.value > 0) {
    // Restore original overall start time *only* for the save function's context
    startTime.value = originalStartTimeForSave
    showProjectModal.value = true
  } else {
    startTime.value = null // Ensure it stays null if modal not shown
  }
}

const saveSession = async () => {
  // Use selectedProjectId now
  if (!selectedProjectId.value || !startTime.value) {
    showProjectModal.value = false // Close modal even on error
    resetState()
    return
  }

  const endTime = dayjs().toDate() // End time is when saved
  const startTimeForApi = dayjs(startTime.value).toDate()
  const endTimeForApi = dayjs(endTime).toDate()

  // Prepare data for API
  const timeEntryData = {
    projectId: selectedProjectId.value,
    startTime: startTimeForApi,
    endTime: endTimeForApi,
    durationSeconds: finalSessionDuration.value,
  }

  try {
    // Call the API endpoint
    const { data: savedEntry, error } = await eden.api[
      "time-entries"
    ].index.post(timeEntryData)

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
    <UModal v-model:open="showProjectModal">
      <template #header>
        <h3 class="text-lg font-semibold">Save Session</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Duration:
          {{ dayjs.duration(finalSessionDuration, "seconds").humanize() }}
        </p>
      </template>

      <template #body>
        <USelectMenu
          v-model="selectedProjectId"
          :items="projects"
          label-key="name"
          value-key="id"
          placeholder="Select project"
          searchable
          searchable-placeholder="Search projects..."
        />
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
            :disabled="!selectedProjectId"
            @click="saveSession"
            >Save Session</UButton
          >
        </div>
      </template>
    </UModal>
  </div>
</template>
