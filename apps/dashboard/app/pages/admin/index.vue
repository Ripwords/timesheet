<script lang="ts" setup>
definePageMeta({
  middleware: "admin",
})

const eden = useEden()

// State for chart data
const { data: projectTotalsData, status: projectTotalsStatus } =
  await useLazyAsyncData("projects-total", async () => {
    const { data } = await eden.api.admin.reports.aggregate.get({
      query: {
        groupBy: "project",
        timeUnit: "none",
      },
    })
    return data ?? []
  })

const { data: userTotalsData, status: userTotalsStatus } =
  await useLazyAsyncData("users-total", async () => {
    const { data } = await eden.api.admin.reports.aggregate.get({
      query: {
        groupBy: "user",
        timeUnit: "none",
      },
    })
    return data ?? []
  })

const { data: projectTimeSeriesData, status: projectTimeSeriesStatus } =
  await useLazyAsyncData("projects-time-series", async () => {
    const { data } = await eden.api.admin.reports.aggregate.get({
      query: {
        groupBy: "project",
        timeUnit: "day",
      },
    })
    return data ?? []
  })

const { data: userTimeSeriesData, status: userTimeSeriesStatus } =
  await useLazyAsyncData("users-time-series", async () => {
    const { data } = await eden.api.admin.reports.aggregate.get({
      query: {
        groupBy: "user",
        timeUnit: "day",
      },
    })
    return data ?? []
  })

const loading = computed(() => {
  return (
    projectTotalsStatus.value === "pending" ||
    userTotalsStatus.value === "pending" ||
    projectTimeSeriesStatus.value === "pending" ||
    userTimeSeriesStatus.value === "pending"
  )
})

const error = computed(() => {
  return (
    projectTotalsStatus.value === "error" ||
    userTotalsStatus.value === "error" ||
    projectTimeSeriesStatus.value === "error" ||
    userTimeSeriesStatus.value === "error"
  )
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
          v-if="projectTotalsData && projectTotalsData.length > 0"
          class="h-64 md:h-80"
        >
          <AdminChartsBarChart
            :data="
              projectTotalsData.map((item) => ({
                label: item.name,
                value: item.totalDuration,
              }))
            "
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
          v-if="userTotalsData && userTotalsData.length > 0"
          class="h-64 md:h-80"
        >
          <AdminChartsBarChart
            :data="
              userTotalsData.map((item) => ({
                label: item.name,
                value: item.totalDuration,
              }))
            "
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
          v-if="projectTimeSeriesData && projectTimeSeriesData.length > 0"
          class="h-80 md:h-96"
        >
          <AdminChartsLineChart
            :data="
              projectTimeSeriesData.map((item) => ({
                label: item.timePeriod,
                value: item.totalDuration,
              }))
            "
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
          v-if="userTimeSeriesData && userTimeSeriesData.length > 0"
          class="h-80 md:h-96"
        >
          <AdminChartsLineChart
            :data="
              userTimeSeriesData.map((item) => ({
                label: item.timePeriod,
                value: item.totalDuration,
              }))
            "
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
