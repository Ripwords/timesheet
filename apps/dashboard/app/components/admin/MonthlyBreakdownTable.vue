<script lang="ts" setup>
import type { ColumnDef, CellContext } from "@tanstack/vue-table"
import { useToast } from "#imports"

interface TimeEntry {
  id: string
  description: string
  date: string
  durationSeconds: number
  cost: number
  weekNumber: number
}

interface User {
  id: string
  name: string
  ratePerHour: number
  totalHours: number
  totalSpend: number
  weeklyHours: [number, number, number, number, number]
  timeEntries: TimeEntry[]
}

interface Department {
  id: string
  name: string
  color: string
  totalHours: number
  totalSpend: number
  users: User[]
}

interface MonthData {
  year: number
  month: number
  retainerFee: number
  totalSpend: number
  leftover: number
  usedPercentage: number
  remainingPercentage: number
}

interface MonthlyBreakdownData {
  project: {
    id: string
    name: string
  }
  monthData: MonthData
  departments: Department[]
}

interface TableRow {
  id: string
  name: string
  type: "department" | "user" | "entry"
  week1: number
  week2: number
  week3: number
  week4: number
  week5: number
  totalHours: number
  totalHoursFormatted: string
  actualSpend: number
  retainerFee: number
  leftover: number
  usedPercentage: number
  remainingPercentage: number
  department?: Department
  user?: User
  entry?: TimeEntry
}

const props = defineProps<{
  projectId: string
}>()

const { $eden, $dayjs } = useNuxtApp()
const toast = useToast()

// State for month selection
const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth() + 1)

// Data fetching
const { data: monthlyData, status } = await useLazyAsyncData(
  `monthly-breakdown-${props.projectId}-${currentYear.value}-${currentMonth.value}`,
  async () => {
    try {
      const { data, error } = await $eden.api.admin
        .financials({
          projectId: props.projectId,
        })
        ["monthly-breakdown"].get({
          query: {
            year: currentYear.value.toString(),
            month: currentMonth.value.toString(),
          },
        })

      if (error) {
        console.error("Error fetching monthly breakdown:", error.value)
        return null
      }
      return data as MonthlyBreakdownData
    } catch (e) {
      console.error("Exception during monthly breakdown fetch:", e)
      return null
    }
  },
  {
    watch: [
      () => props.projectId,
      () => currentYear.value,
      () => currentMonth.value,
    ],
  }
)

// Computed properties
const currentMonthYear = computed(() => {
  return $dayjs(
    `${currentYear.value}-${currentMonth.value.toString().padStart(2, "0")}-01`
  ).format("MMMM YYYY")
})

const leftoverClass = computed(() => {
  if (!monthlyData.value) return ""
  return monthlyData.value.monthData.leftover >= 0
    ? "text-green-600"
    : "text-red-600"
})

// Navigation functions
function previousMonth() {
  if (currentMonth.value === 1) {
    currentMonth.value = 12
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

function nextMonth() {
  if (currentMonth.value === 12) {
    currentMonth.value = 1
    currentYear.value++
  } else {
    currentMonth.value++
  }
}

// Helper function to format hours in XXh XXm format
function formatHours(hours: number): string {
  const wholeHours = Math.floor(hours)
  const minutes = Math.round((hours - wholeHours) * 60)
  return `${wholeHours}h ${minutes}m`
}

// CSV Export functionality
function exportToCSV() {
  if (!monthlyData.value || !tableData.value.length) {
    toast.add({
      title: "No Data",
      description: "No data available to export.",
      color: "warning",
    })
    return
  }

  try {
    const csvRows: string[][] = []

    // Project and period information
    csvRows.push([`Project: ${monthlyData.value.project.name}`])
    csvRows.push([`Period: ${currentMonthYear.value}`])
    csvRows.push([])

    // Financial Summary Section
    csvRows.push(["FINANCIAL SUMMARY"])
    csvRows.push([])

    const retainerFee = monthlyData.value.monthData.retainerFee
    const totalSpend = monthlyData.value.monthData.totalSpend
    const leftover = monthlyData.value.monthData.leftover
    const usedPercentage = monthlyData.value.monthData.usedPercentage
    const remainingPercentage = monthlyData.value.monthData.remainingPercentage

    csvRows.push(["Retainer Fee (Recurring Budget)", retainerFee.toFixed(2)])
    csvRows.push(["Total Team Cost", totalSpend.toFixed(2)])
    csvRows.push(["Profit (Retainer - Cost)", leftover.toFixed(2)])
    csvRows.push(["Budget Used", `${usedPercentage.toFixed(2)}%`])
    csvRows.push(["Budget Remaining", `${remainingPercentage.toFixed(2)}%`])
    csvRows.push([])

    // Detailed Breakdown Section
    csvRows.push(["DETAILED BREAKDOWN"])
    csvRows.push([])

    // Main header row
    const mainHeader = [
      "User/Department",
      "Rate/Day (MYR)",
      "Rate/Hour (MYR)",
      "Week 1",
      "Week 2",
      "Week 3",
      "Week 4",
      "Week 5",
      "Total Hours",
      "Hours (Decimal)",
      "Cost (MYR)",
    ]
    csvRows.push(mainHeader)

    // Sub-header row
    const subHeader = [
      "",
      "",
      "",
      "Hours",
      "Hours",
      "Hours",
      "Hours",
      "Hours",
      "",
      "",
      "",
    ]
    csvRows.push(subHeader)

    // Add department and user rows
    for (const department of monthlyData.value.departments) {
      // Add department summary row
      if (department.totalHours > 0) {
        csvRows.push([]) // Empty row for spacing
        const deptRow = [
          `DEPARTMENT: ${department.name}`,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          formatHours(department.totalHours),
          department.totalHours.toFixed(2),
          department.totalSpend.toFixed(2),
        ]
        csvRows.push(deptRow)
        csvRows.push([]) // Empty row for spacing
      }

      // Add user rows
      for (const user of department.users) {
        if (user.totalHours > 0) {
          // Get rate per hour from backend data, convert string to number if needed
          const ratePerHour =
            typeof user.ratePerHour === "number"
              ? user.ratePerHour
              : typeof user.ratePerHour === "string"
              ? parseFloat(user.ratePerHour)
              : 0
          const ratePerDay = ratePerHour * 8 // Calculate rate per day (8-hour workday)

          const userRow = [
            user.name,
            ratePerDay.toFixed(2),
            ratePerHour.toFixed(2),
            user.weeklyHours[0] > 0 ? formatHours(user.weeklyHours[0]) : "-",
            user.weeklyHours[1] > 0 ? formatHours(user.weeklyHours[1]) : "-",
            user.weeklyHours[2] > 0 ? formatHours(user.weeklyHours[2]) : "-",
            user.weeklyHours[3] > 0 ? formatHours(user.weeklyHours[3]) : "-",
            user.weeklyHours[4] > 0 ? formatHours(user.weeklyHours[4]) : "-",
            formatHours(user.totalHours),
            user.totalHours.toFixed(2),
            user.totalSpend.toFixed(2),
          ]
          csvRows.push(userRow)
        }
      }
    }

    // Add grand total row
    csvRows.push([]) // Empty row for spacing
    const grandTotalHours = monthlyData.value.departments.reduce(
      (sum, dept) => sum + dept.totalHours,
      0
    )
    const grandTotalRow = [
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      formatHours(grandTotalHours),
      grandTotalHours.toFixed(2),
      totalSpend.toFixed(2),
    ]
    csvRows.push(grandTotalRow)

    // Convert to CSV format
    const csvContent = csvRows
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n")

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute(
      "download",
      `${monthlyData.value.project.name}-${currentMonthYear.value}.csv`.replace(
        " ",
        "-"
      )
    )
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast.add({
      title: "Export Successful",
      description: "Monthly breakdown exported to CSV.",
      color: "success",
    })
  } catch (error) {
    console.error("Export failed:", error)
    toast.add({
      title: "Export Failed",
      description: "Failed to export monthly breakdown.",
      color: "error",
    })
  }
}

// Table data processing
const tableData = computed(() => {
  if (!monthlyData.value) return []

  const data: TableRow[] = []

  for (const department of monthlyData.value.departments) {
    // Add department row
    data.push({
      id: `dept-${department.id}`,
      name: department.name,
      type: "department",
      week1: 0,
      week2: 0,
      week3: 0,
      week4: 0,
      week5: 0,
      totalHours: department.totalHours,
      totalHoursFormatted: formatHours(department.totalHours),
      actualSpend: department.totalSpend,
      retainerFee: monthlyData.value.monthData.retainerFee,
      leftover: monthlyData.value.monthData.leftover,
      usedPercentage: monthlyData.value.monthData.usedPercentage,
      remainingPercentage: monthlyData.value.monthData.remainingPercentage,
      department,
    })

    // Add user rows
    for (const user of department.users) {
      data.push({
        id: `user-${user.id}`,
        name: `  ${user.name}`,
        type: "user",
        week1: user.weeklyHours[0],
        week2: user.weeklyHours[1],
        week3: user.weeklyHours[2],
        week4: user.weeklyHours[3],
        week5: user.weeklyHours[4],
        totalHours: user.totalHours,
        totalHoursFormatted: formatHours(user.totalHours),
        actualSpend: user.totalSpend,
        retainerFee: monthlyData.value.monthData.retainerFee,
        leftover: monthlyData.value.monthData.leftover,
        usedPercentage: monthlyData.value.monthData.usedPercentage,
        remainingPercentage: monthlyData.value.monthData.remainingPercentage,
        user,
      })

      // Add time entry rows
      for (const entry of user.timeEntries) {
        const hours = entry.durationSeconds / 3600
        data.push({
          id: `entry-${entry.id}`,
          name: `    ${entry.description}`,
          type: "entry",
          week1: entry.weekNumber === 1 ? hours : 0,
          week2: entry.weekNumber === 2 ? hours : 0,
          week3: entry.weekNumber === 3 ? hours : 0,
          week4: entry.weekNumber === 4 ? hours : 0,
          week5: entry.weekNumber === 5 ? hours : 0,
          totalHours: hours,
          totalHoursFormatted: formatHours(hours),
          actualSpend: entry.cost,
          retainerFee: monthlyData.value.monthData.retainerFee,
          leftover: monthlyData.value.monthData.leftover,
          usedPercentage: monthlyData.value.monthData.usedPercentage,
          remainingPercentage: monthlyData.value.monthData.remainingPercentage,
          entry,
        })
      }
    }
  }

  return data
})

// Table columns
const tableColumns: ColumnDef<TableRow, unknown>[] = [
  {
    accessorKey: "name",
    header: "User/Department",
    cell: (context: CellContext<TableRow, unknown>) => {
      const row = context.row.original
      const isDepartment = row.type === "department"
      const isUser = row.type === "user"
      const isEntry = row.type === "entry"

      return h(
        "span",
        {
          class: [
            isDepartment ? "font-bold text-lg" : "",
            isUser ? "font-medium text-base" : "",
            isEntry ? "text-sm text-gray-400" : "",
          ],
        },
        row.name
      )
    },
  },
  {
    accessorKey: "week1",
    header: "Week 1",
    cell: (context: CellContext<TableRow, unknown>) => {
      const value = context.getValue() as number
      const row = context.row.original
      const isDepartment = row.type === "department"
      return h(
        "span",
        {
          class: [
            "font-mono text-right",
            isDepartment ? "font-bold text-lg" : "text-base",
            value > 0 ? "text-blue-400" : "text-gray-500",
          ],
        },
        value > 0 ? formatHours(value) : "0h 0m"
      )
    },
  },
  {
    accessorKey: "week2",
    header: "Week 2",
    cell: (context: CellContext<TableRow, unknown>) => {
      const value = context.getValue() as number
      const row = context.row.original
      const isDepartment = row.type === "department"
      return h(
        "span",
        {
          class: [
            "font-mono text-right",
            isDepartment ? "font-bold text-lg" : "text-base",
            value > 0 ? "text-blue-400" : "text-gray-500",
          ],
        },
        value > 0 ? formatHours(value) : "0h 0m"
      )
    },
  },
  {
    accessorKey: "week3",
    header: "Week 3",
    cell: (context: CellContext<TableRow, unknown>) => {
      const value = context.getValue() as number
      const row = context.row.original
      const isDepartment = row.type === "department"
      return h(
        "span",
        {
          class: [
            "font-mono text-right",
            isDepartment ? "font-bold text-lg" : "text-base",
            value > 0 ? "text-blue-400" : "text-gray-500",
          ],
        },
        value > 0 ? formatHours(value) : "0h 0m"
      )
    },
  },
  {
    accessorKey: "week4",
    header: "Week 4",
    cell: (context: CellContext<TableRow, unknown>) => {
      const value = context.getValue() as number
      const row = context.row.original
      const isDepartment = row.type === "department"
      return h(
        "span",
        {
          class: [
            "font-mono text-right",
            isDepartment ? "font-bold text-lg" : "text-base",
            value > 0 ? "text-blue-400" : "text-gray-500",
          ],
        },
        value > 0 ? formatHours(value) : "0h 0m"
      )
    },
  },
  {
    accessorKey: "week5",
    header: "Week 5",
    cell: (context: CellContext<TableRow, unknown>) => {
      const value = context.getValue() as number
      const row = context.row.original
      const isDepartment = row.type === "department"
      return h(
        "span",
        {
          class: [
            "font-mono text-right",
            isDepartment ? "font-bold text-lg" : "text-base",
            value > 0 ? "text-blue-400" : "text-gray-500",
          ],
        },
        value > 0 ? formatHours(value) : "0h 0m"
      )
    },
  },
  {
    accessorKey: "totalHoursFormatted",
    header: "TOTAL HOURS",
    cell: (context: CellContext<TableRow, unknown>) => {
      const value = context.getValue() as string
      const row = context.row.original
      const isDepartment = row.type === "department"
      return h(
        "span",
        {
          class: [
            "font-mono font-bold text-right",
            isDepartment ? "text-xl text-green-400" : "text-lg text-green-300",
            row.totalHours > 0 ? "bg-green-900/20 px-2 py-1 rounded" : "",
          ],
        },
        value
      )
    },
  },
  {
    accessorKey: "totalHours",
    header: "HOURS (DEC)",
    cell: (context: CellContext<TableRow, unknown>) => {
      const value = context.getValue() as number
      const row = context.row.original
      const isDepartment = row.type === "department"
      return h(
        "span",
        {
          class: [
            "font-mono text-right",
            isDepartment
              ? "font-bold text-lg text-gray-300"
              : "text-base text-gray-400",
            value > 0 ? "bg-gray-800/20 px-2 py-1 rounded" : "",
          ],
        },
        value.toFixed(2)
      )
    },
  },
  {
    accessorKey: "actualSpend",
    header: "ACTUAL SPEND",
    cell: (context: CellContext<TableRow, unknown>) => {
      const value = context.getValue() as number
      const row = context.row.original
      const isDepartment = row.type === "department"
      return h(
        "span",
        {
          class: [
            "font-mono text-right",
            isDepartment
              ? "font-bold text-lg text-orange-400"
              : "text-base text-orange-300",
            value > 0 ? "bg-orange-900/20 px-2 py-1 rounded" : "",
          ],
        },
        `$${value.toFixed(2)}`
      )
    },
  },
]
</script>

<template>
  <div class="monthly-breakdown">
    <!-- Month Selector -->
    <div class="flex justify-between items-center mb-8">
      <h3 class="text-xl font-bold text-gray-100">Monthly Breakdown</h3>
      <div class="flex items-center gap-4">
        <UButton
          icon="i-heroicons-chevron-left"
          size="sm"
          variant="outline"
          @click="previousMonth"
        />
        <span class="font-semibold text-lg text-gray-200">{{
          currentMonthYear
        }}</span>
        <UButton
          icon="i-heroicons-chevron-right"
          size="sm"
          variant="outline"
          @click="nextMonth"
        />
        <UButton
          v-if="monthlyData && tableData.length > 0"
          icon="i-heroicons-arrow-down-tray"
          size="sm"
          variant="outline"
          label="Export CSV"
          @click="exportToCSV"
        />
      </div>
    </div>

    <!-- Summary Cards -->
    <div
      v-if="monthlyData"
      class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
    >
      <UCard
        class="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border-blue-500/20"
      >
        <template #header>
          <div class="text-sm font-medium text-blue-300">Retainer Fee</div>
        </template>
        <div class="text-3xl font-bold text-blue-400">
          ${{ monthlyData.monthData.retainerFee.toFixed(2) }}
        </div>
      </UCard>

      <UCard
        class="bg-gradient-to-br from-red-900/20 to-red-800/10 border-red-500/20"
      >
        <template #header>
          <div class="text-sm font-medium text-red-300">Actual Spend</div>
        </template>
        <div class="text-3xl font-bold text-red-400">
          ${{ monthlyData.monthData.totalSpend.toFixed(2) }}
        </div>
      </UCard>

      <UCard
        class="bg-gradient-to-br from-green-900/20 to-green-800/10 border-green-500/20"
      >
        <template #header>
          <div class="text-sm font-medium text-green-300">Leftover</div>
        </template>
        <div
          class="text-3xl font-bold"
          :class="leftoverClass"
        >
          ${{ monthlyData.monthData.leftover.toFixed(2) }}
        </div>
      </UCard>

      <UCard
        class="bg-gradient-to-br from-purple-900/20 to-purple-800/10 border-purple-500/20"
      >
        <template #header>
          <div class="text-sm font-medium text-purple-300">Usage</div>
        </template>
        <div class="text-3xl font-bold text-purple-400">
          {{ monthlyData.monthData.usedPercentage }}%
        </div>
      </UCard>
    </div>

    <!-- Breakdown Table -->
    <div
      v-if="monthlyData && tableData.length > 0"
      class="bg-gray-900/50 rounded-lg border border-gray-700/50 overflow-hidden"
    >
      <UTable
        :data="tableData"
        :columns="tableColumns"
        :loading="status === 'pending'"
        class="mt-4"
        :ui="{
          thead: 'bg-gray-800/50',
          tbody: 'divide-y divide-gray-700/50',
          tr: 'hover:bg-gray-800/30 transition-colors',
          th: 'px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider',
          td: 'px-4 py-3 text-sm text-gray-200',
        }"
      />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="monthlyData && tableData.length === 0"
      class="text-center py-12"
    >
      <Icon
        name="i-heroicons-calendar-days"
        class="w-16 h-16 mx-auto mb-6 text-gray-400"
      />
      <p class="text-xl font-semibold mb-2 text-gray-200">No Data Available</p>
      <p class="text-sm text-gray-400">
        No time entries found for {{ currentMonthYear }}
      </p>
    </div>

    <!-- Loading State -->
    <div
      v-else-if="status === 'pending'"
      class="text-center py-12"
    >
      <Icon
        name="i-heroicons-arrow-path"
        class="w-12 h-12 mx-auto mb-4 text-gray-400 animate-spin"
      />
      <p class="text-sm text-gray-400">Loading monthly breakdown...</p>
    </div>
  </div>
</template>
