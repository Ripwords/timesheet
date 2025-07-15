<script setup lang="ts">
import duration from "dayjs/plugin/duration"
import type { TableColumn } from "@nuxt/ui"

definePageMeta({
  middleware: "admin",
})

useSeoMeta({
  title: "Timesheet | Admin Departments",
  description: "Manage departments in the application",
})

const { $eden } = useNuxtApp()
const toast = useToast()
const dayjs = useDayjs()
dayjs.extend(duration)

// --- Month Dropdown ---
const { monthOptions, selectedMonth } = useDropdownMonths()

// --- Departments ---
const {
  data: departmentsData,
  status: departmentsStatus,
  refresh: _refreshDepartments,
} = await useLazyAsyncData("admin-departments", async () => {
  const { data, error } = await $eden.api.admin.departments.get({ query: {} })
  if (error) {
    toast.add({
      title: "Error fetching departments",
      description: String(error.value),
      color: "error",
    })
    return { departments: [], total: 0 }
  }
  return {
    departments: data,
    total: data?.length ?? 0,
  }
})

const selectedDepartmentId = ref<string | undefined>(undefined)

watchEffect(() => {
  if (
    !selectedDepartmentId.value &&
    departmentsData.value?.departments?.length
  ) {
    selectedDepartmentId.value = departmentsData.value.departments[0]?.id
  }
})

// --- Users in Department ---
const {
  data: usersData,
  refresh: refreshUsers,
  status: usersStatus,
} = await useLazyAsyncData(
  "users-in-dept",
  async () => {
    if (!selectedDepartmentId.value) return []
    const { data, error } = await $eden.api.admin.users.get({
      query: { departmentId: selectedDepartmentId.value, page: 1 }, // TODO: Add pagination
    })
    if (error) {
      toast.add({
        title: "Error fetching users",
        description: String(error.value),
        color: "error",
      })
      return []
    }
    return data?.users
  },
  { watch: [selectedDepartmentId] }
)

// --- Time Entries for All Users in Department ---
const userIds = computed(() => usersData.value?.map((u) => u.id) || [])

const {
  data: timeEntriesData,
  refresh: refreshTimeEntries,
  status: timeEntriesStatus,
} = await useLazyAsyncData(
  `dept-time-entries-${selectedDepartmentId.value}-${userIds.value}`,
  async () => {
    if (!userIds.value.length) return []
    const monthStart = dayjs(selectedMonth.value)
      .startOf("month")
      .subtract(7, "days")
      .toISOString()
    const monthEnd = dayjs(selectedMonth.value)
      .endOf("month")
      .add(7, "days")
      .toISOString()

    const { data, error } = await $eden.api["time-entries"].get({
      query: {
        userId: userIds.value,
        startDate: monthStart,
        endDate: monthEnd,
      },
    })
    if (error) {
      toast.add({
        title: "Error fetching time entries",
        description: String(error.value),
        color: "error",
      })
      return []
    }
    return data
  },
  { watch: [userIds, selectedMonth, selectedDepartmentId] }
)

// --- Aggregation Logic (per user, per project, per week) ---
interface WeeklyBreakdownRow {
  projectId: string
  projectName: string
  week1: string
  week2: string
  week3: string
  week4: string
  week5: string // Added week5
  monthlyTotal: string
}

interface TimeEntry {
  projects: {
    id: string
    name: string
    createdAt: Date
    updatedAt: Date
  }
  time_entries: {
    id: string
    userId: string
    projectId: string
    date: string
    description: string | null
    durationSeconds: number
    createdAt: Date
    updatedAt: Date
  }
}

function formatDuration(seconds: number): string {
  if (!seconds) return "-"
  const duration = dayjs.duration(seconds, "seconds")
  const hours = Math.floor(duration.asHours())
  const minutes = duration.minutes()
  return `${hours}h ${minutes}m`
}

const userBreakdowns = computed(() => {
  if (!usersData.value || !timeEntriesData.value) return []
  const startOfMonth = dayjs(selectedMonth.value).startOf("month")
  const endOfMonth = dayjs(selectedMonth.value).endOf("month")

  // Group time entries by userId
  const entriesByUser: Record<string, TimeEntry[]> = {}
  timeEntriesData.value.forEach((entry) => {
    const userId = entry.time_entries.userId
    if (!entriesByUser[userId]) entriesByUser[userId] = []
    entriesByUser[userId].push(entry)
  })

  // For each user, aggregate by project and week
  return usersData.value.map((user) => {
    const userEntries = entriesByUser[user.id] || []
    const projectHours: Record<
      string,
      { name: string; weeks: number[]; total: number }
    > = {}
    const totals = {
      week1: 0,
      week2: 0,
      week3: 0,
      week4: 0,
      week5: 0,
      monthlyTotal: 0,
    } // Added week5

    // Initialize projects
    userEntries.forEach((responseItem) => {
      const project = responseItem.projects
      if (project && !projectHours[project.id]) {
        projectHours[project.id] = {
          name: project.name,
          weeks: [0, 0, 0, 0, 0], // 5 weeks
          total: 0,
        }
      }
    })

    // Process entries
    userEntries.forEach((responseItem: TimeEntry) => {
      const entry = responseItem.time_entries
      const project = responseItem.projects
      if (!entry || !project) return
      const entryStart = dayjs(entry.date)
      const durationSeconds = entry.durationSeconds
      const projectId = entry.projectId
      if (entryStart.isBefore(startOfMonth) || entryStart.isAfter(endOfMonth))
        return
      if (!projectHours[projectId]) {
        projectHours[projectId] = {
          name: project?.name || `Project ${projectId}`,
          weeks: [0, 0, 0, 0, 0], // 5 weeks
          total: 0,
        }
      }
      const dayOfMonth = entryStart.date()
      const weekIndex = Math.floor((dayOfMonth - 1) / 7)
      if (weekIndex >= 0 && weekIndex < 5) {
        const currentWeekSeconds = projectHours[projectId].weeks[weekIndex] || 0
        projectHours[projectId].weeks[weekIndex] =
          currentWeekSeconds + durationSeconds
        projectHours[projectId].total =
          (projectHours[projectId].total || 0) + durationSeconds
        if (weekIndex === 0) totals.week1 += durationSeconds
        if (weekIndex === 1) totals.week2 += durationSeconds
        if (weekIndex === 2) totals.week3 += durationSeconds
        if (weekIndex === 3) totals.week4 += durationSeconds
        if (weekIndex === 4) totals.week5 += durationSeconds // Add week5
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
          week5: formatDuration(data.weeks[4] || 0), // Add week5
          monthlyTotal: formatDuration(data.total || 0),
        })
      )

    return {
      user,
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
          week5: formatDuration(totals.week5), // Add week5
          monthlyTotal: formatDuration(totals.monthlyTotal),
        },
      ],
    }
  })
})

const columns: TableColumn<WeeklyBreakdownRow>[] = [
  { accessorKey: "projectName", header: "Project" },
  { accessorKey: "week1", header: "Week 1" },
  { accessorKey: "week2", header: "Week 2" },
  { accessorKey: "week3", header: "Week 3" },
  { accessorKey: "week4", header: "Week 4" },
  { accessorKey: "week5", header: "Week 5" },
  { accessorKey: "monthlyTotal", header: "Total" },
]

function handleSelect(userId: string, row: { original: WeeklyBreakdownRow }) {
  useRouter().push(`/admin/users/${userId}/project/${row.original.projectId}`)
}

watch([selectedDepartmentId, selectedMonth], async () => {
  await refreshUsers()
  await refreshTimeEntries()
})
</script>

<template>
  <div class="space-y-8">
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-4">
            <label class="text-sm font-medium">Department:</label>
            <USelectMenu
              v-model="selectedDepartmentId"
              :items="departmentsData?.departments || []"
              value-key="id"
              label-key="name"
              placeholder="Select Department"
              class="w-60"
            >
              <template #item="{ item }">
                <Department :department-id="item.id" />
              </template>
              <template #default="{ modelValue }">
                <Department
                  v-if="modelValue"
                  :department-id="modelValue"
                />
              </template>
            </USelectMenu>
          </div>
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
      </template>
      <div
        v-if="departmentsStatus === 'pending'"
        class="p-8 text-center text-gray-500"
      >
        Loading departments...
      </div>
      <div
        v-else-if="!selectedDepartmentId"
        class="p-8 text-center text-gray-500"
      >
        No department selected.
      </div>
      <div
        v-else-if="usersStatus === 'pending'"
        class="p-8 text-center text-gray-500"
      >
        Loading users...
      </div>
      <div
        v-else-if="!userBreakdowns.length"
        class="p-8 text-center text-gray-500"
      >
        No users found in this department.
      </div>
      <div v-else>
        <div
          v-for="breakdown in userBreakdowns"
          :key="breakdown.user.id"
          class="mb-12"
        >
          <UCard>
            <template #header>
              <div class="flex justify-between items-center">
                <div>
                  <span class="font-semibold">{{ breakdown.user.email }}</span>
                  <span class="ml-2 text-xs text-gray-500"
                    >({{ breakdown.user.id }})</span
                  >
                </div>
                <Department :department-id="breakdown.user.departmentId" />
              </div>
            </template>
            <div>
              <h3 class="text-lg font-medium mb-4">
                Weekly Hours Breakdown for
                {{ dayjs(selectedMonth).format("MMMM YYYY") }}
              </h3>
              <UTable
                v-for="(table, index) in Object.entries({
                  rows: breakdown.rows,
                  totals: breakdown.totals,
                })"
                :key="table[0]"
                :data="table[1]"
                :columns="columns"
                :loading="timeEntriesStatus === 'pending'"
                :empty-state="{
                  icon: 'i-heroicons-circle-stack-20-solid',
                  label: 'No time entries found for this month.',
                }"
                :class="{ '-mt-6': index !== 0 }"
                :ui="{ th: index !== 0 ? 'text-transparent' : '' }"
                @select="
                  (row) => {
                    if (index === 0) handleSelect(breakdown.user.id, row)
                  }
                "
              >
                <template #projectName-cell="{ row }">
                  <span
                    :class="{
                      'text-primary-500 cursor-pointer': index === 0,
                      'text-transparent': index !== 0,
                    }"
                  >
                    {{ row.original.projectName }}
                  </span>
                </template>
                <template #monthlyTotal-cell="{ row }">
                  <span class="font-semibold">{{
                    row.original.monthlyTotal
                  }}</span>
                </template>
              </UTable>
            </div>
          </UCard>
        </div>
      </div>
    </UCard>
  </div>
</template>
