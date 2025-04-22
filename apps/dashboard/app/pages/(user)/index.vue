<script lang="ts" setup>
// Define types similar to the admin dashboard, adjusted for user context
interface AggregateDataPoint {
  id?: number // Project ID
  name?: string // Project Name
  totalDuration: number // Duration in seconds
  timePeriod?: string | Date // Time period (e.g., '2023-10-26', '2023-W43')
}

interface AggregateQueryParams {
  startDate?: string // ISO date string
  endDate?: string // ISO date string
  groupBy?: "project" | "user" // 'user' might not be needed here unless showing team stats?
  timeUnit?: "day" | "week" | "month" | "year" | "none"
  userIds?: number[] // We'll filter by the current user's ID
  projectIds?: number[]
}

const eden = useEden()
const dayjs = useDayjs()

// Mock user ID - replace with actual logged-in user ID when auth is ready
const { data: user } = await eden.api.auth.profile.get()
const currentUserId = user?.userId

// State for chart data
const projectTotalsData = ref<AggregateDataPoint[]>([])
const dailyTotalsData = ref<AggregateDataPoint[]>([])
const weeklyTotalsData = ref<AggregateDataPoint[]>([])
// State for summary data
const last7DaysData = ref<AggregateDataPoint[]>([])
const todayData = ref<AggregateDataPoint[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Fetch function, adapted for user context
async function fetchUserAggregateData(
  params: AggregateQueryParams
): Promise<AggregateDataPoint[]> {
  loading.value = true
  error.value = null
  try {
    if (!currentUserId) {
      throw new Error("User ID not found")
    }
    // Ensure we always filter by the current user
    const queryParams = {
      ...params,
      userIds: [currentUserId], // Filter by the current user
      groupBy: params.groupBy === "user" ? "project" : params.groupBy, // Group by project if user is selected
    }

    // Using the admin aggregate endpoint, filtered by user ID
    const response = await eden.api.admin.reports.aggregate.get({
      query: queryParams,
    })

    if (response.error) {
      throw new Error(
        response.error.value?.message || "Unknown API error fetching user data"
      )
    }
    return Array.isArray(response.data)
      ? (response.data as AggregateDataPoint[])
      : []
  } catch (err: unknown) {
    console.error("Error fetching user aggregate data:", err)
    if (err instanceof Error) {
      error.value = err.message
    } else {
      error.value = "An unknown error occurred while fetching user data"
    }
    return []
  } finally {
    loading.value = false
  }
}

// Fetch data on component mount
onMounted(async () => {
  if (!currentUserId) {
    error.value = "User not logged in or session expired."
    loading.value = false
    return // Stop fetching if no user ID
  }

  // Fetch total hours per project for this user
  projectTotalsData.value = await fetchUserAggregateData({
    groupBy: "project",
    timeUnit: "none",
  })

  // Fetch total hours per day for this user
  dailyTotalsData.value = await fetchUserAggregateData({
    groupBy: "project", // Still group by project to see daily breakdown per project
    timeUnit: "day",
  })

  // Fetch total hours per week for this user
  weeklyTotalsData.value = await fetchUserAggregateData({
    groupBy: "project", // Still group by project to see weekly breakdown per project
    timeUnit: "week",
  })

  // Fetch data for summary widgets
  const todayStr = dayjs().format("YYYY-MM-DD")
  const sevenDaysAgoStr = dayjs().subtract(6, "day").format("YYYY-MM-DD") // Include today

  // Fetch aggregated data for the last 7 days (grouped by project, no time unit)
  last7DaysData.value = await fetchUserAggregateData({
    groupBy: "project",
    timeUnit: "none",
    startDate: sevenDaysAgoStr,
    endDate: todayStr,
  })

  // Fetch aggregated data for today (grouped by project, no time unit)
  todayData.value = await fetchUserAggregateData({
    groupBy: "project",
    timeUnit: "none",
    startDate: todayStr,
    endDate: todayStr,
  })
})

// --- Chart Data Formatting (Example - might need adjustments based on chart components) ---

// Format data for the Bar Chart (Project Totals)
const projectBarChartData = computed(() => {
  return projectTotalsData.value.map((item) => ({
    id: item.id,
    label: item.name || `Project ${item.id}`, // Use name, fallback to ID
    value: Math.round((item.totalDuration || 0) / 60), // Convert seconds to minutes
  }))
})

// Format data for the Line Chart (Daily)
const dailyLineChartData = computed(() => {
  // Aggregate data by date if multiple projects exist for the same day
  const aggregated: Record<string, number> = {}
  dailyTotalsData.value.forEach((item) => {
    const dateStr = dayjs(item.timePeriod).format("YYYY-MM-DD") // Ensure consistent format
    if (!aggregated[dateStr]) {
      aggregated[dateStr] = 0
    }
    aggregated[dateStr] += item.totalDuration || 0
  })

  return Object.entries(aggregated)
    .map(([date, duration]) => ({
      label: date,
      value: Math.round(duration / 60), // Convert seconds to minutes
    }))
    .sort((a, b) => a.label.localeCompare(b.label)) // Sort by date
})

// Format data for the Line Chart (Weekly)
const weeklyLineChartData = computed(() => {
  // Aggregate data by week if multiple projects exist for the same week
  const aggregated: Record<string, number> = {}
  weeklyTotalsData.value.forEach((item) => {
    const weekStr = item.timePeriod as string // Assuming DB returns like '2023-W43'
    if (!weekStr) return // Skip if timePeriod is missing
    if (!aggregated[weekStr]) {
      aggregated[weekStr] = 0
    }
    aggregated[weekStr] += item.totalDuration || 0
  })

  return (
    Object.entries(aggregated)
      .map(([week, duration]) => ({
        label: week, // Keep the week string like '2023-W43'
        value: Math.round(duration / 60), // Convert seconds to minutes
      }))
      // Sort by year then week number
      .sort((a, b) => {
        const [yearA, weekA] = a.label.split("-W").map(Number)
        const [yearB, weekB] = b.label.split("-W").map(Number)
        // Add default values (e.g., 0) to handle potential undefined/NaN from split/map
        const safeYearA = yearA ?? 0
        const safeWeekA = weekA ?? 0
        const safeYearB = yearB ?? 0
        const safeWeekB = weekB ?? 0

        if (safeYearA !== safeYearB) return safeYearA - safeYearB
        return safeWeekA - safeWeekB
      })
  )
})

// --- Computed Summary Metrics ---
const totalHoursToday = computed(() => {
  const totalSeconds = todayData.value.reduce(
    (sum, item) => sum + (item.totalDuration || 0),
    0
  )
  return (totalSeconds / 3600).toFixed(2) // Convert seconds to hours
})

const totalHoursLast7Days = computed(() => {
  const totalSeconds = last7DaysData.value.reduce(
    (sum, item) => sum + (item.totalDuration || 0),
    0
  )
  return (totalSeconds / 3600).toFixed(2) // Convert seconds to hours
})

const uniqueProjectsLast7Days = computed(() => {
  // Count unique project IDs from the last 7 days data
  const projectIds = new Set(
    last7DaysData.value.map((item) => item.id).filter((id) => id !== undefined)
  )
  return projectIds.size
})
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
          <AdminChartsBarChart
            :data="projectBarChartData"
            label-field="label"
            value-field="value"
            chart-title="Total Hours per Project (All Time)"
            value-axis-label="Total Duration (Minutes)"
            category-axis-label="Project"
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
          <!-- Optional: Link to start timer -->
          <!-- <UButton label="Start Timer" icon="i-heroicons-play" block class="mt-4" /> -->
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
          <AdminChartsLineChart
            :data="dailyLineChartData"
            label-field="label"
            value-field="value"
            chart-title="Total Hours per Day"
            value-axis-label="Total Duration (Minutes)"
            category-axis-label="Date"
            time-unit="day"
          />
          <p class="text-xs text-gray-500 mt-1">
            Note: Duration shown in minutes.
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
          <AdminChartsLineChart
            :data="weeklyLineChartData"
            label-field="label"
            value-field="value"
            chart-title="Total Hours per Week"
            value-axis-label="Total Duration (Minutes)"
            category-axis-label="Week"
            time-unit="week"
          />
          <p class="text-xs text-gray-500 mt-1">
            Note: Duration shown in minutes.
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
  </div>
</template>
