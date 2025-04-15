<script lang="ts" setup>
definePageMeta({
  middleware: "admin",
})

// Type for API response items
interface AggregateDataPoint {
  id?: number // User or Project ID
  name?: string // Project Name
  email?: string // User Email
  totalDuration: number // Duration in seconds
  timePeriod?: string | Date // Optional time period (string from DB, might need parsing)
}

// Type for the query parameters for the aggregate endpoint
interface AggregateQueryParams {
  startDate?: string // ISO date string
  endDate?: string // ISO date string
  groupBy?: "project" | "user"
  timeUnit?: "day" | "week" | "month" | "year" | "none"
  userIds?: number[]
  projectIds?: number[]
}

const eden = useEden() // Assuming useEden is configured globally

// State for chart data
const projectTotalsData = ref<AggregateDataPoint[]>([])
const userTotalsData = ref<AggregateDataPoint[]>([])
const projectTimeSeriesData = ref<AggregateDataPoint[]>([])
const userTimeSeriesData = ref<AggregateDataPoint[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Use the specific type for params
async function fetchAggregateData(
  params: AggregateQueryParams
): Promise<AggregateDataPoint[]> {
  loading.value = true
  error.value = null
  try {
    // Pass the typed params object directly
    const response = await eden.api.admin.reports.aggregate.get({
      query: params,
    })
    if (response.error) {
      throw new Error(response.error.value?.message || "Unknown API error")
    }
    // Ensure data is an array, default to empty array if not
    // Cast to the expected type after checking if it's an array
    return Array.isArray(response.data)
      ? (response.data as AggregateDataPoint[])
      : []
  } catch (err: unknown) {
    console.error("Error fetching aggregate data:", err)
    // Check if it's an error object before accessing message
    if (err instanceof Error) {
      error.value = err.message
    } else {
      error.value = "An unknown error occurred while fetching data"
    }
    return [] // Return empty array on error
  } finally {
    loading.value = false
  }
}

// Fetch data on component mount
onMounted(async () => {
  // Fetch total hours per project (no time unit)
  projectTotalsData.value = await fetchAggregateData({
    groupBy: "project",
    timeUnit: "none",
  })

  // Fetch total hours per user (no time unit)
  userTotalsData.value = await fetchAggregateData({
    groupBy: "user",
    timeUnit: "none",
  })

  // Fetch project hours over time (e.g., by day)
  projectTimeSeriesData.value = await fetchAggregateData({
    groupBy: "project",
    timeUnit: "day",
  })

  // Fetch user hours over time (e.g., by day)
  userTimeSeriesData.value = await fetchAggregateData({
    groupBy: "user",
    timeUnit: "day",
  })
})
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold mb-6">Admin Dashboard Overview</h1>

    <div
      v-if="loading"
      class="text-center py-10"
    >
      <p>Loading chart data...</p>
      <!-- Optional: Add a spinner component -->
    </div>
    <div
      v-if="error"
      class="text-red-500 bg-red-100 p-4 rounded mb-6"
    >
      Error loading data: {{ error }}
    </div>

    <div
      v-if="!loading && !error"
      class="grid grid-cols-1 md:grid-cols-2 gap-8"
    >
      <!-- Chart: Total Hours per Project -->
      <UCard>
        <template #header>
          <h2 class="text-lg font-medium">Total Hours per Project</h2>
        </template>
        <div
          v-if="projectTotalsData.length > 0"
          class="h-64 md:h-80"
        >
          <AdminChartsBarChart
            :data="projectTotalsData"
            label-field="name"
            value-field="totalDuration"
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
          No project data available.
        </div>
      </UCard>

      <!-- Chart: Total Hours per User -->
      <UCard>
        <template #header>
          <h2 class="text-lg font-medium">Total Hours per User</h2>
        </template>
        <div
          v-if="userTotalsData.length > 0"
          class="h-64 md:h-80"
        >
          <AdminChartsBarChart
            :data="userTotalsData"
            label-field="email"
            value-field="totalDuration"
            chart-title="Total Hours per User (All Time)"
            value-axis-label="Total Duration (Minutes)"
            category-axis-label="User"
          />
          <p class="text-xs text-gray-500 mt-1">
            Note: Duration shown in minutes.
          </p>
        </div>
        <div
          v-else
          class="text-center text-gray-500 py-10"
        >
          No user data available.
        </div>
      </UCard>

      <!-- Chart: Project Hours Over Time -->
      <UCard class="md:col-span-2">
        <template #header>
          <h2 class="text-lg font-medium">Project Hours Over Time (Daily)</h2>
        </template>
        <div
          v-if="projectTimeSeriesData.length > 0"
          class="h-80 md:h-96"
        >
          <AdminChartsLineChart
            :data="projectTimeSeriesData"
            label-field="timePeriod"
            value-field="totalDuration"
            chart-title="Project Hours per Day"
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
          No time series data available for projects.
        </div>
      </UCard>

      <!-- Chart: User Hours Over Time -->
      <UCard class="md:col-span-2">
        <template #header>
          <h2 class="text-lg font-medium">User Hours Over Time (Daily)</h2>
        </template>
        <div
          v-if="userTimeSeriesData.length > 0"
          class="h-80 md:h-96"
        >
          <AdminChartsLineChart
            :data="userTimeSeriesData"
            label-field="timePeriod"
            value-field="totalDuration"
            chart-title="User Hours per Day"
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
          No time series data available for users.
        </div>
      </UCard>
    </div>
  </div>
</template>
