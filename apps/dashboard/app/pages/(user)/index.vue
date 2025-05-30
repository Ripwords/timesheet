<script lang="ts" setup>
import duration from "dayjs/plugin/duration"
import weekOfYear from "dayjs/plugin/weekOfYear"

useSeoMeta({
  title: "Timesheet | User Dashboard",
  description: "User dashboard for managing the application",
})

// Prevent accidental tab closure during active timer
const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (timerStatus.value === "running" || timerStatus.value === "paused") {
    event.preventDefault()
  }
}

// Add/remove beforeunload listener based on timer status
const setupBeforeUnloadProtection = () => {
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", handleBeforeUnload)
  }
}

const removeBeforeUnloadProtection = () => {
  if (typeof window !== "undefined") {
    window.removeEventListener("beforeunload", handleBeforeUnload)
  }
}

// Cleanup on component unmount
onUnmounted(() => {
  removeBeforeUnloadProtection()
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
  }
})

const { $eden } = useNuxtApp()
const dayjs = useDayjs()
dayjs.extend(duration)
dayjs.extend(weekOfYear)
const toast = useToast() // Added for feedback

// Fetch data for summary widgets
const todayStr = dayjs().format("YYYY-MM-DD")
const sevenDaysAgoStr = dayjs().subtract(6, "day").format("YYYY-MM-DD") // Include today

const { data: user } = await $eden.api.auth.profile.get()
const currentUserId = user?.id
if (!currentUserId) {
  useRouter().push("/auth/login")
}

// State for chart data
const loading = ref(false)
const error = ref<string | null>(null)

const { data: projectTotalsData, refresh: refreshProjectTotals } =
  await useLazyAsyncData("project-user-totals", async () => {
    const { data } = await $eden.api.admin.reports.aggregate.get({
      query: {
        groupBy: "project",
        timeUnit: "none",
      },
    })
    return data ?? []
  })

const { data: dailyTotalsData, refresh: refreshDailyTotals } =
  await useLazyAsyncData("daily-totals", async () => {
    const { data } = await $eden.api.admin.reports.aggregate.get({
      query: {
        groupBy: "project",
        timeUnit: "day",
      },
    })
    return data ?? []
  })

const { data: weeklyTotalsData, refresh: refreshWeeklyTotals } =
  await useLazyAsyncData("weekly-totals", async () => {
    const { data } = await $eden.api.admin.reports.aggregate.get({
      query: {
        groupBy: "project",
        timeUnit: "week",
      },
    })
    return data ?? []
  })

const { data: last7DaysData, refresh: refreshLast7Days } =
  await useLazyAsyncData("last-7-days", async () => {
    const { data } = await $eden.api.admin.reports.aggregate.get({
      query: {
        groupBy: "project",
        timeUnit: "none",
        startDate: sevenDaysAgoStr,
        endDate: todayStr,
      },
    })
    return data ?? []
  })

const { data: todayData, refresh: refreshToday } = await useLazyAsyncData(
  "today",
  async () => {
    const { data } = await $eden.api.admin.reports.aggregate.get({
      query: {
        groupBy: "project",
        timeUnit: "none",
        startDate: todayStr,
        endDate: todayStr,
      },
    })
    return data ?? []
  }
)

const refreshAllData = async () => {
  await refreshProjectTotals()
  await refreshDailyTotals()
  await refreshWeeklyTotals()
  await refreshLast7Days()
  await refreshToday()
}

// --- Chart Data Formatting ---
// Format data for the Bar Chart (Project Totals)
const projectBarChartData = computed(() => {
  return (
    projectTotalsData.value?.map((item) => ({
      id: item.id,
      label: item.name || `Project ${item.id}`, // Use name, fallback to ID
      value: Math.round(Number(item.totalDuration) / 60),
      isActive: item.isActive, // Include the isActive status
    })) ?? []
  )
})

// Format data for the Line Chart (Daily)
const dailyLineChartData = computed(() => {
  // Aggregate data by date if multiple projects exist for the same day
  const aggregated: Record<string, number> = {}
  dailyTotalsData.value?.forEach((item) => {
    const dateStr = dayjs(item.timePeriod).format("YYYY-MM-DD") // Ensure consistent format
    if (!aggregated[dateStr]) {
      aggregated[dateStr] = 0
    }
    aggregated[dateStr] += Number(item.totalDuration) || 0
  })

  return Object.entries(aggregated)
    .map(([date, duration]) => ({
      label: new Date(date),
      value: Math.round(duration / 60),
    }))
    .sort((a, b) => a.label.getTime() - b.label.getTime()) // Sort by date
})

// Format data for the Line Chart (Weekly)
const weeklyLineChartData = computed(() => {
  // Aggregate data by week if multiple projects exist for the same week
  const aggregated: Map<string, { date: Date; duration: number }> = new Map()

  weeklyTotalsData.value?.forEach((item) => {
    // Parse the timePeriod as a date (it's already the start of the week from DB)
    const weekStartDate = dayjs(item.timePeriod).format("MM-YYYY")

    // Use ISO string as key for consistent aggregation (no need for startOf since DB already gives us week start)

    if (!aggregated.has(weekStartDate)) {
      aggregated.set(weekStartDate, {
        date: dayjs(item.timePeriod).toDate(),
        duration: 0,
      })
    }
    const existing = aggregated.get(weekStartDate)!
    existing.duration += Number(item.totalDuration) || 0
  })

  return Array.from(aggregated.values())
    .map(({ date, duration }) => ({
      label: date, // Pass the actual Date object for the chart
      value: Math.round(duration / 60), // Convert seconds to minutes
    }))
    .sort((a, b) => (a.label as Date).getTime() - (b.label as Date).getTime()) // Sort by date
})

// --- Computed Summary Metrics ---
const totalHoursToday = computed(() => {
  const totalSeconds =
    todayData.value?.reduce(
      (sum, item) => sum + Number(item.totalDuration),
      0
    ) ?? 0
  return (totalSeconds / 3600).toFixed(2) // Convert seconds to hours
})

const totalHoursLast7Days = computed(() => {
  const totalSeconds =
    last7DaysData.value?.reduce(
      (sum, item) => sum + Number(item.totalDuration),
      0
    ) ?? 0
  return (totalSeconds / 3600).toFixed(2) // Convert seconds to hours
})

const uniqueProjectsLast7Days = computed(() => {
  // Count unique project IDs from the last 7 days data
  const projectIds = new Set(
    last7DaysData.value
      ?.map((item) => item.id)
      .filter((id) => id !== undefined) ?? []
  )
  return projectIds.size
})

// --- Time Tracker State ---
const timerInterval = ref<NodeJS.Timeout | null>(null)
const timerStatus = ref<"stopped" | "running" | "paused">("stopped")
const startTime = ref<number | null>(null) // Timestamp of the *very first* start after stopped
const intervalStartTime = ref<number | null>(null) // Timestamp of the start of the current running interval (start or resume)
const totalAccumulatedDuration = ref(0) // Seconds accumulated before the current running interval
const currentIntervalElapsedTime = ref(0) // Seconds elapsed in the current running interval
const showProjectModal = ref(false)
const finalSessionDuration = ref(0) // Store final duration when stopping
const selectedProjectId = ref<string | undefined>() // Changed type to allow undefined initially
const timeEntryDescription = ref("")

// --- Fetch Data for Timer ---
// Fetch Projects for Select Menu
const { data: projectsForSelect } = await useLazyAsyncData(
  "projects-for-select",
  async () => {
    const { data: projectData } = await $eden.api.projects.get({
      query: { limit: 0 },
    })

    if (!projectData) return []

    return projectData.projects.map((project) => ({
      id: project.id,
      name: project.name,
    }))
  }
)

// Fetch Default Descriptions
const { data: defaultDescriptions } = await useLazyAsyncData(
  `default-descriptions`,
  async () => {
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
  }
)

// --- Timer Computed Properties ---
const formattedElapsedTime = computed(() => {
  const totalSeconds =
    totalAccumulatedDuration.value + currentIntervalElapsedTime.value
  const duration = dayjs.duration(totalSeconds, "seconds")
  // Ensure leading zeros
  const hours = String(Math.floor(duration.asHours())).padStart(2, "0")
  const minutes = String(duration.minutes()).padStart(2, "0")
  const seconds = String(duration.seconds()).padStart(2, "0")
  return `${hours}:${minutes}:${seconds}`
})

// Use optional chaining and provide a default threshold if data is loading/missing
const exceedsDepartmentThreshold = computed(() => {
  const threshold = defaultDescriptions?.value?.departmentThreshold
  // Check if threshold is a valid number and duration exceeds it
  return typeof threshold === "number" && finalSessionDuration.value > threshold
})

// --- Custom description logic ---
const customDescription = ref("")
const dropdownDescription = ref<string | undefined>() // Can be undefined if nothing selected

// Watch for changes in threshold status or descriptions to update the final description
watch(
  [exceedsDepartmentThreshold, customDescription, dropdownDescription],
  ([exceeds, custom, dropdown]) => {
    if (exceeds) {
      // If threshold exceeded, only custom description is allowed
      timeEntryDescription.value = custom
    } else {
      // Otherwise, prefer custom, fallback to dropdown
      timeEntryDescription.value = custom || dropdown || "" // Ensure it's always a string
    }
  }
)

// Reset descriptions when modal opens
watch(
  () => showProjectModal.value,
  (isOpen) => {
    if (isOpen) {
      customDescription.value = ""
      dropdownDescription.value = undefined // Reset dropdown selection
      timeEntryDescription.value = "" // Reset final description
    }
  }
)

// --- Timer Methods ---
const resetState = () => {
  // Reset all timer state
  timerStatus.value = "stopped"
  startTime.value = null
  intervalStartTime.value = null
  totalAccumulatedDuration.value = 0
  currentIntervalElapsedTime.value = 0
  selectedProjectId.value = undefined
  timeEntryDescription.value = ""
  finalSessionDuration.value = 0 // Also reset final duration
  customDescription.value = ""
  dropdownDescription.value = undefined

  // Remove beforeunload protection when timer is fully stopped
  removeBeforeUnloadProtection()

  // Note: No history refresh here as history table is separate
}

const startTimer = () => {
  if (timerStatus.value === "running") return

  const now = Date.now()
  intervalStartTime.value = now // Mark the start of this interval

  if (timerStatus.value === "stopped") {
    startTime.value = now // Set the overall start time
    totalAccumulatedDuration.value = 0 // Reset accumulated duration
    currentIntervalElapsedTime.value = 0 // Reset current interval time
    // Set up beforeunload protection when starting from stopped
    setupBeforeUnloadProtection()
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

  finalSessionDuration.value = finalDuration // Store the final duration

  // Reset timer display state *before* showing modal
  timerStatus.value = "stopped"
  intervalStartTime.value = null
  totalAccumulatedDuration.value = 0
  currentIntervalElapsedTime.value = 0
  // Keep startTime.value = originalStartTimeForSave temporarily for modal save logic

  // Show modal only if time elapsed
  if (finalSessionDuration.value > 0 && originalStartTimeForSave) {
    // Restore original overall start time *only* for the save function's context
    startTime.value = originalStartTimeForSave
    showProjectModal.value = true
  } else {
    // If no time elapsed or error, fully reset
    resetState()
  }
}

const saveSession = async () => {
  const projectIdToSave = selectedProjectId.value
  const descriptionToSave = timeEntryDescription.value
  const dateForApi = startTime.value
    ? dayjs(startTime.value).format("YYYY-MM-DD")
    : null
  const finalDurationToSave = finalSessionDuration.value

  // Double check required fields before proceeding
  if (!projectIdToSave || !dateForApi || finalDurationToSave <= 0) {
    toast.add({
      title: "Error",
      description: "Missing required data to save session.",
      color: "error",
    })
    showProjectModal.value = false // Close modal
    resetState() // Fully reset state
    await refreshAllData()
    return
  }

  // Prepare data for API - now using date instead of startTime/endTime
  const timeEntryData = {
    projectId: projectIdToSave,
    date: dateForApi,
    durationSeconds: finalDurationToSave,
    ...(descriptionToSave && { description: descriptionToSave }),
  }

  try {
    const { data: savedEntry, error } = await $eden.api["time-entries"].post(
      timeEntryData
    )

    if (error?.value) {
      console.error("API Error saving session:", error.value)
      toast.add({
        title: "Error saving session",
        description: `API Error: ${error.value || "Unknown error"}`, // More detailed error
        color: "error",
      })
    } else if (savedEntry) {
      toast.add({
        title: "Session Saved!",
        description: `Duration: ${dayjs
          .duration(finalDurationToSave, "seconds")
          .humanize()}`,
        color: "success",
      })
    }
  } catch (e) {
    console.error("Catch block error saving session:", e)
    toast.add({
      title: "Error",
      description: `An unexpected error occurred: ${e}`,
      color: "error",
    })
  } finally {
    // Reset state and close modal regardless of success or failure
    showProjectModal.value = false
    resetState()
  }
}

const cancelSession = () => {
  showProjectModal.value = false
  resetState() // Ensure state is fully reset on cancel
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold mb-6">My Dashboard</h1>

    <div
      v-if="loading"
      class="text-center py-10"
    >
      <p>Loading dashboard data...</p>
      <!-- Optional: Add a spinner -->
    </div>
    <div
      v-if="error"
      class="text-red-500 bg-red-100 p-4 rounded mb-6"
    >
      Error loading data: {{ error }}
    </div>

    <div
      v-if="!loading && !error && currentUserId"
      class="grid grid-cols-1 md:grid-cols-2 gap-8"
    >
      <!-- Chart: Total Hours per Project -->
      <UCard>
        <template #header>
          <h2 class="text-lg font-medium">Total Hours per Project</h2>
        </template>
        <div
          v-if="projectBarChartData.length > 0"
          class="h-64 md:h-80"
        >
          <!-- Assuming AdminChartsBarChart can be reused or adapted -->
          <AdminChartsBar
            :data="projectBarChartData"
            label-field="label"
            value-field="value"
            chart-title="Total Hours per Project (All Time)"
            value-axis-label="Total Duration (Hours)"
            category-axis-label="Project"
            project-status-field="isActive"
          />
          <p class="text-xs text-gray-500 mt-1">
            Note: Duration shown in minutes.
          </p>
        </div>
        <div
          v-else
          class="text-center text-gray-500 py-10"
        >
          No project time tracked yet.
        </div>
      </UCard>

      <!-- Summary Widget -->
      <UCard>
        <template #header>
          <h2 class="text-lg font-medium">Summary</h2>
        </template>
        <div class="space-y-4 p-4">
          <div class="flex justify-between items-center">
            <span class="text-gray-600 dark:text-gray-400">Hours Today:</span>
            <span class="font-semibold text-lg">{{ totalHoursToday }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-gray-600 dark:text-gray-400"
              >Hours Last 7 Days:</span
            >
            <span class="font-semibold text-lg">{{ totalHoursLast7Days }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-gray-600 dark:text-gray-400"
              >Projects Last 7 Days:</span
            >
            <span class="font-semibold text-lg">{{
              uniqueProjectsLast7Days
            }}</span>
          </div>

          <!-- Time Tracker Card -->
          <UCard>
            <template #header>
              <h2 class="text-lg font-medium">Time Tracker</h2>
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
                  size="sm"
                  variant="solid"
                  aria-label="Start or Resume Timer"
                  :disabled="timerStatus === 'running'"
                  @click="startTimer"
                >
                  {{ timerStatus === "paused" ? "Resume" : "Start" }}
                </UButton>
                <UButton
                  icon="i-heroicons-pause"
                  size="sm"
                  color="warning"
                  variant="solid"
                  aria-label="Pause Timer"
                  :disabled="timerStatus !== 'running'"
                  @click="pauseTimer"
                >
                  Pause
                </UButton>
                <UButton
                  icon="i-heroicons-stop-circle"
                  size="sm"
                  color="error"
                  variant="solid"
                  aria-label="End Timer Session"
                  :disabled="timerStatus === 'stopped'"
                  @click="endTimer"
                >
                  End
                </UButton>
              </div>
            </div>
            <div class="p-4 text-sm text-gray-500 dark:text-gray-400">
              Use the controls above to track your time. Click 'End' to save the
              session.
            </div>
          </UCard>
        </div>
      </UCard>

      <!-- Chart: Daily Hours Over Time -->
      <UCard class="md:col-span-2">
        <template #header>
          <h2 class="text-lg font-medium">Daily Hours Over Time</h2>
        </template>
        <div
          v-if="dailyLineChartData.length > 0"
          class="h-80 md:h-96"
        >
          <!-- Assuming AdminChartsLineChart can be reused or adapted -->
          <AdminChartsLine
            :data="dailyLineChartData"
            label-field="label"
            value-field="value"
            chart-title="Total Hours per Day"
            value-axis-label="Total Duration (Hours)"
            category-axis-label="Date"
            time-unit="day"
          />
          <p class="text-xs text-gray-500 mt-1">
            Note: Duration shown in hours.
          </p>
        </div>
        <div
          v-else
          class="text-center text-gray-500 py-10"
        >
          No daily time data available.
        </div>
      </UCard>

      <!-- Chart: Weekly Hours Over Time -->
      <UCard class="md:col-span-2">
        <template #header>
          <h2 class="text-lg font-medium">Weekly Hours Over Time</h2>
        </template>
        <div
          v-if="weeklyLineChartData.length > 0"
          class="h-80 md:h-96"
        >
          <!-- Assuming AdminChartsLineChart can be reused or adapted -->
          <AdminChartsLine
            :data="weeklyLineChartData"
            label-field="label"
            value-field="value"
            chart-title="Total Hours per Week"
            value-axis-label="Total Duration (Hours)"
            category-axis-label="Week"
            time-unit="week"
          />
          <p class="text-xs text-gray-500 mt-1">
            Note: Duration shown in hours.
          </p>
        </div>
        <div
          v-else
          class="text-center text-gray-500 py-10"
        >
          No weekly time data available.
        </div>
      </UCard>
    </div>
    <div v-else-if="!loading && !currentUserId && !error">
      <p class="text-center py-10 text-gray-500">
        Please log in to view your dashboard.
      </p>
    </div>

    <!-- Save Session Modal -->
    <UModal
      v-model:open="showProjectModal"
      :dismissible="false"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3
                class="text-base font-semibold leading-6 text-gray-900 dark:text-white"
              >
                Save Session
              </h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Duration:
                {{
                  dayjs
                    .duration(finalSessionDuration, "seconds")
                    .format("HH:mm:ss")
                }}
                ({{
                  dayjs.duration(finalSessionDuration, "seconds").humanize()
                }})
              </p>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-x-mark-20-solid"
                class="-my-1"
                @click="cancelSession"
              />
            </div>
          </template>

          <div class="p-4 flex flex-col gap-4">
            <UFormField
              label="Project"
              name="project"
              required
            >
              <USelectMenu
                v-model="selectedProjectId"
                :items="projectsForSelect"
                label-key="name"
                value-key="id"
                placeholder="Select project"
                searchable
                searchable-placeholder="Search projects..."
              />
            </UFormField>

            <UFormField
              label="Description"
              name="description"
            >
              <template v-if="exceedsDepartmentThreshold">
                <UInput
                  v-model="customDescription"
                  placeholder="Enter description (required for long session)..."
                  required
                  :ui="{ base: 'w-full' }"
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
                <!-- Dropdown for default/previous descriptions -->
                <USelectMenu
                  v-model="dropdownDescription"
                  :items="
                    defaultDescriptions?.defaultDescriptions?.map(
                      (d) => d.description
                    ) ?? []
                  "
                  placeholder="Select common task or type custom..."
                  creatable
                  searchable
                  searchable-placeholder="Search or add description..."
                  class="mb-2"
                />
                <!-- Input for custom description (optional unless threshold exceeded) -->
                <UInput
                  v-model="customDescription"
                  placeholder="Or enter a custom description..."
                  :ui="{ base: 'w-full' }"
                />
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Select a common task or type a custom description. Custom
                  input overrides selection.
                </p>
              </template>
            </UFormField>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="cancelSession"
              >
                Cancel
              </UButton>
              <UButton
                label="Save Session"
                color="primary"
                :disabled="
                  !selectedProjectId ||
                  (exceedsDepartmentThreshold && !customDescription.trim())
                "
                @click="saveSession"
              />
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
