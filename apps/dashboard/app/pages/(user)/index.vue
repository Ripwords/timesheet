<script lang="ts" setup>
const eden = useEden()
const dayjs = useDayjs()

// Fetch data for summary widgets
const todayStr = dayjs().format("YYYY-MM-DD")
const sevenDaysAgoStr = dayjs().subtract(6, "day").format("YYYY-MM-DD") // Include today

const { data: user } = await eden.api.auth.profile.get()
const currentUserId = user?.userId
if (!currentUserId) {
  useRouter().push("/login")
}

// State for chart data
const loading = ref(false)
const error = ref<string | null>(null)

const { data: projectTotalsData } = await useLazyAsyncData(
  "project-user-totals",
  async () => {
    const { data } = await eden.api.admin.reports.aggregate.get({
      query: {
        groupBy: "project",
        timeUnit: "none",
      },
    })
    return data ?? []
  }
)

const { data: dailyTotalsData } = await useLazyAsyncData(
  "daily-totals",
  async () => {
    const { data } = await eden.api.admin.reports.aggregate.get({
      query: {
        groupBy: "project",
        timeUnit: "day",
      },
    })
    return data ?? []
  }
)

const { data: weeklyTotalsData } = await useLazyAsyncData(
  "weekly-totals",
  async () => {
    const { data } = await eden.api.admin.reports.aggregate.get({
      query: {
        groupBy: "project",
        timeUnit: "week",
      },
    })
    return data ?? []
  }
)

const { data: last7DaysData } = await useLazyAsyncData(
  "last-7-days",
  async () => {
    const { data } = await eden.api.admin.reports.aggregate.get({
      query: {
        groupBy: "project",
        timeUnit: "none",
        startDate: sevenDaysAgoStr,
        endDate: todayStr,
      },
    })
    return data ?? []
  }
)

const { data: todayData } = await useLazyAsyncData("today", async () => {
  const { data } = await eden.api.admin.reports.aggregate.get({
    query: {
      groupBy: "project",
      timeUnit: "none",
      startDate: todayStr,
      endDate: todayStr,
    },
  })
  return data ?? []
})

// --- Chart Data Formatting ---
// Format data for the Bar Chart (Project Totals)
const projectBarChartData = computed(() => {
  return (
    projectTotalsData.value?.map((item) => ({
      id: item.id,
      label: item.name || `Project ${item.id}`, // Use name, fallback to ID
      value: Math.round((item.totalDuration || 0) / 60), // Convert seconds to minutes
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
  weeklyTotalsData.value?.forEach((item) => {
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
  const totalSeconds =
    todayData.value?.reduce(
      (sum, item) => sum + (item.totalDuration || 0),
      0
    ) ?? 0
  return (totalSeconds / 3600).toFixed(2) // Convert seconds to hours
})

const totalHoursLast7Days = computed(() => {
  const totalSeconds =
    last7DaysData.value?.reduce(
      (sum, item) => sum + (item.totalDuration || 0),
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
          <UButton
            label="Start Timer"
            icon="i-heroicons-play"
            block
            class="mt-4"
          />
          <UButton
            label="Stop Timer"
            icon="i-heroicons-stop"
            block
            color="error"
            class="mt-4"
          />
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
