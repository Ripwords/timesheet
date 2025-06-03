<script setup lang="ts">
import duration from "dayjs/plugin/duration"

const dayjs = useDayjs()
dayjs.extend(duration)

const toast = useToast()
const { $eden } = useNuxtApp()

// State
const isStarting = ref(false)
const actionStates = ref<Record<string, boolean>>({}) // Track loading states for individual session actions
const newSessionDescription = ref("")
const isNewSessionModalOpen = ref(false)

// Project selection modal state for ending sessions
const showProjectModal = ref(false)
const sessionToEnd = ref()
const finalSessionDuration = ref(0) // in minutes
const selectedProjectId = ref("")
const isSavingEntry = ref(false)

// Description state for project modal
const selectedDefaultDescription = ref<string | undefined>(undefined)
const customDescription = ref("")

// Real-time elapsed time tracking
const currentTimes = ref<Record<string, number>>({})

// Data fetching using useLazyAsyncData
const {
  data: activeSessions,
  status: loadingStatus,
  refresh: refreshActiveSessions,
} = await useLazyAsyncData("active-timer-sessions", async () => {
  try {
    const { data, error } = await $eden.api["time-tracker"].active.get()

    if (error) {
      toast.add({
        title: "Error fetching active sessions",
        description: String(error.value),
        color: "error",
      })
      return []
    }

    if (data?.hasActiveSessions && data.sessions) {
      // Transform the data to match our interface
      const transformedSessions = data.sessions.map((session) => ({
        ...session,
        startTime:
          typeof session.startTime === "string"
            ? session.startTime
            : session.startTime.toISOString(),
        lastIntervalStartTime: session.lastIntervalStartTime
          ? typeof session.lastIntervalStartTime === "string"
            ? session.lastIntervalStartTime
            : session.lastIntervalStartTime.toISOString()
          : null,
      }))

      // Initialize current times
      data.sessions.forEach((session) => {
        currentTimes.value[session.id] = session.currentElapsedTotal
      })

      return transformedSessions
    } else {
      currentTimes.value = {}
      return []
    }
  } catch (fetchError) {
    console.error(fetchError)
    toast.add({
      title: "Error fetching active sessions",
      description: "An unexpected error occurred",
      color: "error",
    })
    return []
  }
})

// Fetch projects for the modal
const { data: projects, status: _loadingProjectsStatus } =
  await useLazyAsyncData("projects-for-timer", async () => {
    try {
      const { data, error } = await $eden.api.projects.get({
        query: { page: 1, limit: 0 },
      })

      if (error) {
        toast.add({
          title: "Error fetching projects",
          description: String(error.value),
          color: "error",
        })
        return []
      }

      return data?.projects || []
    } catch (error) {
      console.error(error)
      toast.add({
        title: "Error fetching projects",
        description: "An unexpected error occurred",
        color: "error",
      })
      return []
    }
  })

// Fetch Default Descriptions
const { data: defaultDescriptions, status: _loadingDefaultsStatus } =
  await useLazyAsyncData("default-descriptions-timer", async () => {
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

// Computed
const hasActiveSessions = computed(
  () => (activeSessions.value || []).length > 0
)
const isLoading = computed(() => loadingStatus.value === "pending")

const exceedsDepartmentThresholdInModal = computed(() => {
  const durationMinutes = finalSessionDuration.value
  const thresholdMinutes = defaultDescriptions.value?.departmentThreshold || 0
  return durationMinutes > thresholdMinutes
})

// Sort sessions to keep running timers at the top
const sortedActiveSessions = computed(() => {
  if (!activeSessions.value) return []

  return [...activeSessions.value].sort((a, b) => {
    // Running sessions come first
    if (a.status === "running" && b.status !== "running") return -1
    if (a.status !== "running" && b.status === "running") return 1

    // For non-running sessions, sort by start time (oldest first)
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  })
})

// Methods
const formatElapsedTime = (totalSeconds: number): string => {
  const d = dayjs.duration(totalSeconds, "seconds")
  const hours = Math.floor(d.asHours())
  const minutes = d.minutes()
  const seconds = d.seconds()

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`
}

const setActionState = (sessionId: string, loading: boolean) => {
  actionStates.value[sessionId] = loading
}

const getActionState = (sessionId: string): boolean => {
  return actionStates.value[sessionId] || false
}

// Helper method to pause all running sessions except optionally one specific session
const pauseAllRunningSessionsExcept = async (exceptSessionId?: string) => {
  if (!activeSessions.value) return

  const runningSessions = activeSessions.value.filter(
    (session) => session.status === "running" && session.id !== exceptSessionId
  )

  if (runningSessions.length === 0) return

  // Pause all running sessions in parallel
  const pausePromises = runningSessions.map(async (session) => {
    try {
      setActionState(session.id, true)
      const { error } = await $eden.api["time-tracker"]
        .pause({ sessionId: session.id })
        .post()

      if (error) {
        console.error(`Error pausing session ${session.id}:`, error.value)
        toast.add({
          title: "Error pausing session",
          description: `Failed to pause session: ${
            session.description || session.id
          }`,
          color: "warning",
        })
      }
    } catch (error) {
      console.error(`Error pausing session ${session.id}:`, error)
    } finally {
      setActionState(session.id, false)
    }
  })

  await Promise.allSettled(pausePromises)

  if (runningSessions.length > 0) {
    toast.add({
      title: "Other sessions paused",
      description: `${runningSessions.length} running session${
        runningSessions.length > 1 ? "s" : ""
      } paused automatically`,
      color: "info",
    })
  }
}

const startNewSession = async () => {
  isStarting.value = true
  try {
    // First, pause all currently running sessions
    await pauseAllRunningSessionsExcept()

    const { error } = await $eden.api["time-tracker"].start.post({
      description: newSessionDescription.value || undefined,
    })

    if (error) {
      toast.add({
        title: "Error starting session",
        description: String(error.value),
        color: "error",
      })
      return
    }

    toast.add({
      title: "Session Started",
      description: "New timer session has been started",
      color: "success",
    })

    newSessionDescription.value = ""
    isNewSessionModalOpen.value = false
    await refreshActiveSessions()
  } catch (error) {
    console.error(error)
    toast.add({
      title: "Error starting session",
      description: "An unexpected error occurred",
      color: "error",
    })
  } finally {
    isStarting.value = false
  }
}

const pauseSession = async (sessionId: string) => {
  setActionState(sessionId, true)
  try {
    const { error } = await $eden.api["time-tracker"]
      .pause({ sessionId })
      .post()

    if (error) {
      toast.add({
        title: "Error pausing session",
        description: String(error.value),
        color: "error",
      })
      return
    }

    toast.add({
      title: "Session Paused",
      color: "success",
    })

    await refreshActiveSessions()
  } catch (sessionError) {
    console.error(sessionError)
    toast.add({
      title: "Error pausing session",
      description: "An unexpected error occurred",
      color: "error",
    })
  } finally {
    setActionState(sessionId, false)
  }
}

const resumeSession = async (sessionId: string) => {
  setActionState(sessionId, true)
  try {
    // First, pause all other running sessions
    await pauseAllRunningSessionsExcept(sessionId)

    const { error } = await $eden.api["time-tracker"]
      .resume({ sessionId })
      .post()

    if (error) {
      toast.add({
        title: "Error resuming session",
        description: String(error.value),
        color: "error",
      })
      return
    }

    toast.add({
      title: "Session Resumed",
      color: "success",
    })

    await refreshActiveSessions()
  } catch (sessionError) {
    console.error(sessionError)
    toast.add({
      title: "Error resuming session",
      description: "An unexpected error occurred",
      color: "error",
    })
  } finally {
    setActionState(sessionId, false)
  }
}

const endSession = async (sessionId: string) => {
  const session = (activeSessions.value || []).find((s) => s.id === sessionId)
  if (!session) {
    toast.add({
      title: "Error",
      description: "Session not found",
      color: "error",
    })
    return
  }

  setActionState(sessionId, true)

  try {
    // First pause the session if it's running to get final duration
    if (session.status === "running") {
      const { error: pauseError } = await $eden.api["time-tracker"]
        .pause({ sessionId })
        .post()
      if (pauseError) {
        toast.add({
          title: "Error pausing session",
          description: String(pauseError.value),
          color: "error",
        })
        return
      }
      // Refresh to get updated session data
      await refreshActiveSessions()
    }

    // Get the current elapsed time
    const totalSeconds =
      currentTimes.value[sessionId] || session.currentElapsedTotal

    if (totalSeconds > 0) {
      // Store session info for the modal
      sessionToEnd.value = session
      finalSessionDuration.value = totalSeconds / 60 // Convert to minutes
      selectedProjectId.value = ""
      selectedDefaultDescription.value = undefined
      customDescription.value = ""

      // Show project selection modal
      showProjectModal.value = true

      toast.add({
        title: "Session Stopped",
        description: `Ready to save: ${formatElapsedTime(totalSeconds)}`,
        color: "info",
      })
    } else {
      // No time elapsed, just delete the session
      await deleteSessionDirectly(sessionId)
      toast.add({
        title: "Session Ended",
        description: "No time was recorded",
        color: "info",
      })
    }
  } catch (sessionError) {
    console.error(sessionError)
    toast.add({
      title: "Error ending session",
      description: "An unexpected error occurred",
      color: "error",
    })
  } finally {
    setActionState(sessionId, false)
  }
}

const deleteSessionDirectly = async (sessionId: string) => {
  try {
    const { error } = await $eden.api["time-tracker"]({ sessionId }).delete()

    if (error) {
      toast.add({
        title: "Error deleting session",
        description: String(error.value),
        color: "error",
      })
      return false
    }

    await refreshActiveSessions()
    return true
  } catch (error) {
    console.error(error)
    toast.add({
      title: "Error deleting session",
      description: "An unexpected error occurred",
      color: "error",
    })
    return false
  }
}

const saveTimerSession = async () => {
  if (!sessionToEnd.value || !selectedProjectId.value) {
    toast.add({
      title: "Validation Error",
      description: "Please select a project",
      color: "warning",
    })
    return
  }

  // Validate description based on department threshold
  let finalDescription = ""
  if (exceedsDepartmentThresholdInModal.value) {
    // If exceeds threshold, custom description is required
    if (!customDescription.value || customDescription.value.trim() === "") {
      toast.add({
        title: "Validation Error",
        description:
          "A detailed description is required for sessions exceeding your department's threshold.",
        color: "warning",
      })
      return
    }
    finalDescription = customDescription.value.trim()
  } else {
    // If doesn't exceed threshold, use custom description or selected default
    finalDescription =
      customDescription.value.trim() || selectedDefaultDescription.value || ""

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

  isSavingEntry.value = true

  try {
    // Step 1: Save the time entry FIRST (following old timer logic)
    const durationSeconds = Math.floor(finalSessionDuration.value * 60)

    const { error: saveError } = await $eden.api["time-entries"].post({
      projectId: selectedProjectId.value,
      date: dayjs(sessionToEnd.value.startTime).format("YYYY-MM-DD"),
      durationSeconds,
      description: finalDescription,
    })

    if (saveError) {
      toast.add({
        title: "Error saving time entry",
        description: String(saveError.value),
        color: "error",
      })
      return
    }

    // Step 2: ONLY delete the timer session if save was successful
    const { error: deleteError } = await $eden.api["time-tracker"]({
      sessionId: sessionToEnd.value.id,
    }).delete()

    if (deleteError) {
      toast.add({
        title: "Warning: Session saved but cleanup failed",
        description:
          "Time entry saved successfully, but timer session cleanup failed. Please refresh the page.",
        color: "warning",
      })
    }

    toast.add({
      title: "Session Saved Successfully",
      description: `${formatElapsedTime(durationSeconds)} saved to project`,
      color: "success",
    })

    // Reset modal state and refresh data
    closeProjectModal()
    await refreshActiveSessions()
  } catch (error) {
    console.error(error)
    toast.add({
      title: "Error saving session",
      description: "An unexpected error occurred",
      color: "error",
    })
  } finally {
    isSavingEntry.value = false
  }
}

const discardSession = async () => {
  if (!sessionToEnd.value) return

  isSavingEntry.value = true

  try {
    await deleteSessionDirectly(sessionToEnd.value.id)

    toast.add({
      title: "Session Discarded",
      description: "Timer session was discarded without saving",
      color: "info",
    })

    closeProjectModal()
  } catch (error) {
    console.error(error)
    toast.add({
      title: "Error discarding session",
      description: "An unexpected error occurred",
      color: "error",
    })
  } finally {
    isSavingEntry.value = false
  }
}

const closeProjectModal = () => {
  showProjectModal.value = false
  sessionToEnd.value = null
  finalSessionDuration.value = 0
  selectedProjectId.value = ""
  selectedDefaultDescription.value = undefined
  customDescription.value = ""
}

const openNewSessionModal = () => {
  newSessionDescription.value = ""
  isNewSessionModalOpen.value = true
}

// Real-time timer updates
let timerId: ReturnType<typeof setInterval> | null = null
let refreshIntervalId: ReturnType<typeof setInterval> | null = null

const startRealtimeUpdates = () => {
  if (!import.meta.client) return // Only run on client

  if (timerId) clearInterval(timerId)

  timerId = setInterval(() => {
    ;(activeSessions.value || []).forEach((session) => {
      if (session.status === "running") {
        currentTimes.value[session.id] =
          (currentTimes.value[session.id] || session.currentElapsedTotal) + 1
      }
    })
  }, 1000)
}

const stopRealtimeUpdates = () => {
  if (timerId) {
    clearInterval(timerId)
    timerId = null
  }
}

const startAutoRefresh = () => {
  if (!import.meta.client) return // Only run on client

  // Auto-refresh sessions periodically to sync with server
  refreshIntervalId = setInterval(() => {
    if (!isLoading.value) {
      refreshActiveSessions()
    }
  }, 30000) // Refresh every 30 seconds
}

const stopAutoRefresh = () => {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId)
    refreshIntervalId = null
  }
}

// Lifecycle
onMounted(() => {
  startRealtimeUpdates()
  startAutoRefresh()
})

onUnmounted(() => {
  stopRealtimeUpdates()
  stopAutoRefresh()
})

// Watch for changes in sessions to manage real-time updates
watch(
  activeSessions,
  (newSessions) => {
    if (!newSessions) return

    const hasRunningSessions = newSessions.some(
      (session) => session.status === "running"
    )

    if (hasRunningSessions) {
      startRealtimeUpdates()
    } else {
      stopRealtimeUpdates()
    }
  },
  { deep: true }
)
</script>

<template>
  <div class="space-y-6">
    <!-- Header with actions -->
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-semibold">Timer Sessions</h2>
      <div class="flex gap-2">
        <UButton
          icon="i-heroicons-plus"
          :disabled="isLoading"
          @click="openNewSessionModal"
        >
          New Session
        </UButton>
      </div>
    </div>

    <!-- New Session Modal -->
    <UModal
      v-model:open="isNewSessionModalOpen"
      prevent-close
    >
      <template #header>
        <h3 class="text-lg font-semibold">Start New Timer Session</h3>
      </template>
      <template #body>
        <UForm
          :state="{ description: newSessionDescription }"
          @submit="startNewSession"
        >
          <UFormField
            label="Description (Optional)"
            class="mb-4 w-full"
          >
            <UTextarea
              v-model="newSessionDescription"
              class="w-full"
              placeholder="What are you working on?"
              :rows="3"
            />
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton
              type="button"
              variant="outline"
              @click="isNewSessionModalOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              :loading="isStarting"
            >
              Start Session
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <!-- Project Selection Modal for Ending Sessions -->
    <UModal
      v-model:open="showProjectModal"
      prevent-close
    >
      <template #header>
        <h3 class="text-lg font-semibold">Save Timer Session</h3>
      </template>
      <template #body>
        <UCard>
          <div class="space-y-4">
            <div class="text-sm text-gray-600 dark:text-gray-300">
              <p>
                <strong>Duration:</strong>
                {{ formatElapsedTime(Math.floor(finalSessionDuration * 60)) }}
              </p>
              <p v-if="sessionToEnd?.description">
                <strong>Session Description:</strong>
                {{ sessionToEnd.description }}
              </p>
              <p>
                <strong>Date:</strong>
                {{
                  sessionToEnd
                    ? dayjs(sessionToEnd.startTime).format("YYYY-MM-DD")
                    : ""
                }}
              </p>
            </div>

            <UFormField
              label="Select Project"
              required
            >
              <USelectMenu
                v-model="selectedProjectId"
                class="w-full"
                value-key="id"
                label-key="name"
                placeholder="Choose a project to save this session to"
                :items="projects || []"
                searchable
              />
            </UFormField>

            <!-- Description Section -->
            <div>
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
                  v-model="customDescription"
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
                color="error"
                :loading="isSavingEntry"
                @click="discardSession"
              >
                Discard
              </UButton>
              <UButton
                type="button"
                variant="outline"
                @click="closeProjectModal"
              >
                Cancel
              </UButton>
              <UButton
                type="button"
                :loading="isSavingEntry"
                :disabled="!selectedProjectId"
                @click="saveTimerSession"
              >
                Save Session
              </UButton>
            </div>
          </div>
        </UCard>
      </template>
    </UModal>

    <!-- Active Sessions List -->
    <div
      v-if="isLoading && !hasActiveSessions"
      class="flex justify-center py-8"
    >
      <UIcon
        name="i-heroicons-arrow-path"
        class="animate-spin text-2xl"
      />
    </div>

    <div
      v-else-if="!hasActiveSessions"
      class="text-center py-8"
    >
      <UIcon
        name="i-heroicons-clock"
        class="text-4xl text-gray-400 mb-2"
      />
      <p class="text-gray-500">No active timer sessions</p>
      <p class="text-sm text-gray-400">
        Click "Start New Session" to begin tracking time
      </p>
    </div>

    <div
      v-else
      class="grid gap-4"
    >
      <UCard
        v-for="session in sortedActiveSessions"
        :key="session.id"
        :class="
          session.status === 'running'
            ? 'border-green-200 dark:border-green-800'
            : 'border-orange-200 dark:border-orange-800'
        "
      >
        <template #header>
          <div class="flex justify-between items-center">
            <div class="flex items-center gap-2">
              <UBadge
                :color="session.status === 'running' ? 'success' : 'warning'"
                :label="session.status === 'running' ? 'Running' : 'Paused'"
              />
              <span class="text-sm text-gray-500">
                Started: {{ dayjs(session.startTime).format("HH:mm:ss") }}
              </span>
            </div>
            <div class="text-lg font-mono font-semibold">
              {{
                formatElapsedTime(
                  currentTimes[session.id] || session.currentElapsedTotal
                )
              }}
            </div>
          </div>
        </template>

        <div class="space-y-3">
          <div class="text-sm">
            <span class="font-medium">Description:</span>
            <p class="text-gray-600 dark:text-gray-300 mt-1">
              {{ session.description || "No description" }}
            </p>
          </div>

          <!-- Actions -->
          <div class="flex gap-2 justify-end">
            <UButton
              v-if="session.status === 'running'"
              icon="i-heroicons-pause"
              size="sm"
              color="warning"
              :loading="getActionState(session.id)"
              @click="pauseSession(session.id)"
            >
              Pause
            </UButton>
            <UButton
              v-else
              icon="i-heroicons-play"
              size="sm"
              color="success"
              :loading="getActionState(session.id)"
              @click="resumeSession(session.id)"
            >
              Resume
            </UButton>
            <UButton
              icon="i-heroicons-stop"
              size="sm"
              color="error"
              variant="outline"
              :loading="getActionState(session.id)"
              @click="endSession(session.id)"
            >
              End Session
            </UButton>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
