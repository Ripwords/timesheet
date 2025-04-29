<script lang="ts" setup>
import type { TableColumn, TableRow } from "@nuxt/ui"
import duration from "dayjs/plugin/duration"

definePageMeta({
  middleware: "admin",
})

interface WeeklyBreakdownRow {
  projectId: string
  projectName: string
  week1: string
  week2: string
  week3: string
  week4: string
  monthlyTotal: string
}

const { params } = useRoute("admin-users-userId")
const userId = params.userId

const { $eden } = useNuxtApp()
const dayjs = useDayjs()
dayjs.extend(duration)

// --- State ---
const { monthOptions, selectedMonth } = useDropdownMonths()

const {
  data: user,
  refresh: refreshUser,
  status: userStatus,
  error: userError,
} = await useLazyAsyncData(`user-${userId}`, async () => {
  const { data } = await $eden.api.admin.users
    .user({
      id: userId,
    })
    .get()
  return data
})

const {
  data: timeEntries,
  refresh: refreshTimeEntries,
  status: timeEntriesStatus,
  error: timeEntriesError,
} = await useLazyAsyncData(
  `time-entries-${userId}`,
  async () => {
    const monthStart = dayjs(selectedMonth.value)
      .startOf("month")
      .subtract(7, "days")
      .toISOString()
    const monthEnd = dayjs(selectedMonth.value)
      .endOf("month")
      .add(7, "days")
      .toISOString()

    const { data } = await $eden.api["time-entries"].index.get({
      query: {
        userId,
        startDate: monthStart,
        endDate: monthEnd,
      },
    })
    return data
  },
  {
    watch: [selectedMonth],
  }
)

const projects = computed(() => {
  return timeEntries.value?.map((entry) => entry.projects)
})

// Adjust based on actual API response structure from error
const isLoading = computed(() => {
  return userStatus.value === "pending" || timeEntriesStatus.value === "pending"
})
const error = computed(() => {
  return userError.value || timeEntriesError.value
})

// --- Computed Properties for Data & Totals ---
const processedData = computed(() => {
  const startOfMonth = dayjs(selectedMonth.value).startOf("month")
  const endOfMonth = dayjs(selectedMonth.value).endOf("month")

  const projectHours: Record<
    string,
    { name: string; weeks: number[]; total: number }
  > = {}

  // Initialize weekly totals in seconds
  const totals = { week1: 0, week2: 0, week3: 0, week4: 0, monthlyTotal: 0 }

  // Initialize projects based on fetched projects
  projects.value?.forEach((p) => {
    if (p) {
      // Add check for null/undefined project
      projectHours[p.id] = { name: p.name, weeks: [0, 0, 0, 0, 0], total: 0 }
    }
  })

  // Process the fetched time entries
  timeEntries.value?.forEach((responseItem) => {
    // Access data from the nested structure
    const entry = responseItem.time_entries
    const project = responseItem.projects

    // Add checks for null/undefined entry or project
    if (!entry || !project) return

    const entryStart = dayjs(entry.startTime)
    const durationSeconds = entry.durationSeconds
    const projectId = entry.projectId

    // Ensure the entry is within the selected month for calculation
    if (entryStart.isBefore(startOfMonth) || entryStart.isAfter(endOfMonth)) {
      return
    }

    // Ensure project record exists before adding hours
    if (!projectHours[projectId]) {
      const projectName = project?.name || `Project ${projectId}`
      projectHours[projectId] = {
        name: projectName,
        weeks: [0, 0, 0, 0, 0],
        total: 0,
      }
    }

    // Determine week index
    const dayOfMonth = entryStart.date()
    const weekIndex = Math.floor((dayOfMonth - 1) / 7)

    // Safely add duration and update totals
    if (weekIndex >= 0 && weekIndex < 5) {
      const currentWeekSeconds = projectHours[projectId].weeks[weekIndex] || 0
      projectHours[projectId].weeks[weekIndex] =
        currentWeekSeconds + durationSeconds
      projectHours[projectId].total =
        (projectHours[projectId].total || 0) + durationSeconds

      // Update column totals
      if (weekIndex === 0) totals.week1 += durationSeconds
      if (weekIndex === 1) totals.week2 += durationSeconds
      if (weekIndex === 2) totals.week3 += durationSeconds
      if (weekIndex === 3) totals.week4 += durationSeconds
      // Note: week 5 data isn't displayed but is calculated, could add totals.week5 if needed
      totals.monthlyTotal += durationSeconds
    }
  })

  // Format rows for UTable
  const rows = Object.entries(projectHours)
    .filter(([_, data]) => data.total > 0)
    .map(
      ([projectId, data]): WeeklyBreakdownRow => ({
        projectId,
        projectName: data.name,
        week1: formatDuration(data.weeks[0] || 0),
        week2: formatDuration(data.weeks[1] || 0),
        week3: formatDuration(data.weeks[2] || 0),
        week4: formatDuration(data.weeks[3] || 0),
        monthlyTotal: formatDuration(data.total || 0),
      })
    )

  return {
    rows,
    totals: [
      {
        projectId: "",
        projectName:
          rows.length > 0
            ? rows.reduce((longest, current) =>
                current.projectName.length > longest.projectName.length
                  ? current
                  : longest
              ).projectName
            : "Project Name",
        week1: formatDuration(totals.week1),
        week2: formatDuration(totals.week2),
        week3: formatDuration(totals.week3),
        week4: formatDuration(totals.week4),
        monthlyTotal: formatDuration(totals.monthlyTotal),
      },
    ],
  }
})

const refreshData = async () => {
  await refreshUser()
  await refreshTimeEntries()
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return "-"
  const duration = dayjs.duration(seconds, "seconds")
  const hours = Math.floor(duration.asHours())
  const minutes = duration.minutes()
  return `${hours}h ${minutes}m`
}

// --- Watchers ---
watch(selectedMonth, refreshData)

// --- Table Columns ---
const columns: TableColumn<WeeklyBreakdownRow>[] = [
  { accessorKey: "projectName", header: "Project" },
  {
    accessorKey: "week1",
    header: "Week 1",
  },
  {
    accessorKey: "week2",
    header: "Week 2",
  },
  {
    accessorKey: "week3",
    header: "Week 3",
  },
  {
    accessorKey: "week4",
    header: "Week 4",
  },
  {
    accessorKey: "monthlyTotal",
    header: "Total",
  },
]

const handleSelect = (row: TableRow<WeeklyBreakdownRow>) => {
  useRouter().push(`/admin/users/${userId}/project/${row.original.projectId}`)
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <h2 class="text-xl font-semibold">
          {{ user?.email || "Loading..." }}
        </h2>
        <div>
          <label
            class="mr-2 text-sm font-medium text-gray-700 dark:text-gray-300"
            >Month:</label
          >
          <UDropdownMenu
            :items="monthOptions"
            :popper="{ placement: 'bottom-end' }"
          >
            <UButton
              icon="i-heroicons-calendar-days-20-solid"
              :label="dayjs(selectedMonth).format('MMMM YYYY')"
              color="neutral"
            />
          </UDropdownMenu>
        </div>
      </div>
      <div
        v-if="user"
        class="text-sm text-gray-500 dark:text-gray-400 mt-1"
      >
        <Department :department-id="user.departmentId" />
      </div>
    </template>
    <div
      v-if="error"
      class="text-center p-4 text-red-500"
    >
      Error: {{ error }}
    </div>
    <div>
      <h3 class="text-lg font-medium mb-4">
        Weekly Hours Breakdown for
        {{ dayjs(selectedMonth).format("MMMM YYYY") }}
      </h3>
      <UTable
        v-for="(table, index) in Object.entries(processedData)"
        :key="table[0]"
        :data="table[1]"
        :columns
        :loading="isLoading"
        :empty-state="{
          icon: 'i-heroicons-circle-stack-20-solid',
          label: 'No time entries found for this month.',
        }"
        :class="{
          '-mt-6': index !== 0,
        }"
        :ui="{
          th: index !== 0 ? 'text-transparent' : '',
        }"
        @select="
          (row) => {
            if (index === 0) {
              handleSelect(row)
            }
          }
        "
      >
        <template #projectName-cell="{ row }">
          <span
            :class="{
              'text-primary-500 cursor-pointer': index === 0,
              'text-transparent': index !== 0,
            }"
            >{{ row.original.projectName }}</span
          >
        </template>

        <template #monthlyTotal-cell="{ row }">
          <span class="font-semibold">{{ row.original.monthlyTotal }}</span>
        </template>
      </UTable>
    </div>
  </UCard>
</template>
