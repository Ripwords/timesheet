<script lang="ts" setup>
import type { ColumnDef, CellContext } from "@tanstack/vue-table"
import { useToast } from "#imports"

interface TimeEntry {
  id: string
  description: string | null
  date: string
  durationSeconds: number
  cost: number
  weekNumber: number
}

interface User {
  id: string
  name: string
  ratePerHour: string
  totalHours: number
  totalSpend: number
  weeklyHours: number[]
  timeEntries: TimeEntry[]
}

interface Department {
  id: string
  name: string
  color: string
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

interface DepartmentBudgetSplit {
  id: string
  departmentId: string
  budgetAmount: string
  createdAt: Date
  updatedAt: Date
  departmentName: string
  departmentColor: string
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
const {
  data: monthlyData,
  status,
  refresh: refreshMonthlyData,
} = await useLazyAsyncData(
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
      return data
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

// Fetch lifetime project data (not affected by month filter)
const {
  data: lifetimeData,
  status: _lifetimeStatus,
  refresh: _refreshLifetimeData,
} = await useLazyAsyncData(
  `lifetime-data-${props.projectId}`,
  async () => {
    try {
      const { data, error } = await $eden.api.admin
        .financials({
          projectId: props.projectId,
        })
        ["lifetime"].get()

      if (error) {
        console.error("Error fetching lifetime data:", error.value)
        return null
      }
      return data
    } catch (e) {
      console.error("Exception during lifetime data fetch:", e)
      return null
    }
  },
  {
    watch: [() => props.projectId],
  }
)

// Fetch department budget splits
const { data: splitsData, refresh: refreshSplits } = await useLazyAsyncData(
  `department-splits-${props.projectId}`,
  async () => {
    try {
      const { data, error } = await $eden.api.admin
        .financials({
          projectId: props.projectId,
        })
        ["department-splits"].get()

      if (error) {
        console.error("Error fetching department splits:", error.value)
        return []
      }
      return data as DepartmentBudgetSplit[]
    } catch (e) {
      console.error("Exception during department splits fetch:", e)
      return []
    }
  },
  {
    watch: [() => props.projectId],
  }
)

// Fetch available departments
const { data: departmentsData } = await useLazyAsyncData(
  `departments`,
  async () => {
    try {
      const { data, error } = await $eden.api.admin.departments.get({
        query: {},
      })
      if (error) {
        console.error("Error fetching departments:", error.value)
        return []
      }
      return data as Array<{ id: string; name: string; color: string }>
    } catch (e) {
      console.error("Exception during departments fetch:", e)
      return []
    }
  }
)

// State for department budget splits
const departmentSplits = computed(() => splitsData.value || [])
const availableDepartments = computed(() => departmentsData.value || [])

// State for department budget splits modals
const isAddSplitModalOpen = ref(false)
const isEditSplitModalOpen = ref(false)
const isDeleteSplitModalOpen = ref(false)
const selectedSplit = ref<DepartmentBudgetSplit | null>(null)

// Form state for department budget splits
const newSplitData = reactive({
  departmentId: "",
  budgetAmount: 0,
})

const editSplitData = reactive({
  departmentId: "",
  budgetAmount: 0,
})

// Computed properties for USelectMenu binding
const newSplitDepartment = computed({
  get() {
    return newSplitData.departmentId
  },
  set(value: string | undefined) {
    newSplitData.departmentId = value || ""
  },
})

const editSplitDepartment = computed({
  get() {
    return editSplitData.departmentId
  },
  set(value: string | undefined) {
    editSplitData.departmentId = value || ""
  },
})

// Functions to manage department budget splits
function openAddSplitModal() {
  newSplitData.departmentId = ""
  newSplitData.budgetAmount = 0
  isAddSplitModalOpen.value = true
}

function openEditSplitModal(split: DepartmentBudgetSplit) {
  selectedSplit.value = split
  editSplitData.departmentId = split.departmentId
  editSplitData.budgetAmount = parseFloat(split.budgetAmount)
  isEditSplitModalOpen.value = true
}

function openDeleteSplitModal(split: DepartmentBudgetSplit) {
  selectedSplit.value = split
  isDeleteSplitModalOpen.value = true
}

async function handleAddSplit() {
  if (!newSplitData.departmentId || newSplitData.budgetAmount <= 0) {
    toast.add({
      title: "Validation Error",
      description:
        "Please select a department and enter a valid budget amount.",
      color: "error",
    })
    return
  }

  try {
    const { error } = await $eden.api.admin
      .financials({
        projectId: props.projectId,
      })
      ["department-splits"].post({
        departmentId: newSplitData.departmentId,
        budgetAmount: newSplitData.budgetAmount,
      })

    if (error) {
      toast.add({
        title: "Error",
        description: String(error.value),
        color: "error",
      })
    } else {
      toast.add({
        title: "Success",
        description: "Department budget split added successfully.",
        color: "success",
      })
      isAddSplitModalOpen.value = false
      await refreshSplits()
      await refreshMonthlyData()
    }
  } catch (error) {
    console.error("Failed to add department split:", error)
    toast.add({
      title: "Error",
      description: "Could not add department budget split.",
      color: "error",
    })
  }
}

async function handleUpdateSplit() {
  if (
    !selectedSplit.value ||
    !editSplitData.departmentId ||
    editSplitData.budgetAmount <= 0
  ) {
    toast.add({
      title: "Validation Error",
      description:
        "Please select a department and enter a valid budget amount.",
      color: "error",
    })
    return
  }

  try {
    const { error } = await $eden.api.admin
      .financials({
        projectId: props.projectId,
      })
      ["department-splits"].post({
        departmentId: editSplitData.departmentId,
        budgetAmount: editSplitData.budgetAmount,
      })

    if (error) {
      toast.add({
        title: "Error",
        description: String(error.value),
        color: "error",
      })
    } else {
      toast.add({
        title: "Success",
        description: "Department budget split updated successfully.",
        color: "success",
      })
      isEditSplitModalOpen.value = false
      selectedSplit.value = null
      await refreshSplits()
    }
  } catch (error) {
    console.error("Failed to update department split:", error)
    toast.add({
      title: "Error",
      description: "Could not update department budget split.",
      color: "error",
    })
  }
}

async function handleDeleteSplit() {
  if (!selectedSplit.value) return

  try {
    const { error } = await $eden.api.admin
      .financials({
        projectId: props.projectId,
      })
      ["department-splits"]({
        departmentId: selectedSplit.value.departmentId,
      })
      .delete()

    if (error) {
      toast.add({
        title: "Error",
        description: String(error.value),
        color: "error",
      })
    } else {
      toast.add({
        title: "Success",
        description: "Department budget split deleted successfully.",
        color: "success",
      })
      isDeleteSplitModalOpen.value = false
      selectedSplit.value = null
      await refreshSplits()
    }
  } catch (error) {
    console.error("Failed to delete department split:", error)
    toast.add({
      title: "Error",
      description: "Could not delete department budget split.",
      color: "error",
    })
  }
}

// Computed properties
const currentMonthYear = computed(() => {
  return $dayjs(
    `${currentYear.value}-${currentMonth.value.toString().padStart(2, "0")}-01`
  ).format("MMMM YYYY")
})

const leftoverClass = computed(() => {
  if (!monthlyData.value) return ""
  return monthlyData.value.overallMonthData.leftover >= 0
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

    // Overall Project Summary (lifetime data)
    if (lifetimeData.value?.lifetimeData) {
      const lifetime = lifetimeData.value.lifetimeData
      csvRows.push(["OVERALL PROJECT SUMMARY (LIFETIME)"])
      csvRows.push([])
      csvRows.push(["Total Budget", (lifetime.totalBudget ?? 0).toFixed(2)])
      csvRows.push(["Total Spend", (lifetime.totalSpend ?? 0).toFixed(2)])
      csvRows.push(["Leftover", (lifetime.leftover ?? 0).toFixed(2)])
      csvRows.push(["Used", `${(lifetime.usedPercentage ?? 0).toFixed(0)}%`])
      csvRows.push([])
    }

    // Monthly Breakdown Section
    csvRows.push(["MONTHLY BREAKDOWN"])
    csvRows.push([])

    // Monthly Summary Cards
    csvRows.push(["Monthly Summary"])
    csvRows.push([])
    const retainerFee = monthlyData.value.overallMonthData.retainerFee
    const totalSpend = monthlyData.value.overallMonthData.totalSpend
    const leftover = monthlyData.value.overallMonthData.leftover
    const usedPercentage = monthlyData.value.overallMonthData.usedPercentage
    const _remainingPercentage =
      monthlyData.value.overallMonthData.remainingPercentage

    csvRows.push(["Retainer Fee", retainerFee.toFixed(2)])
    csvRows.push(["Actual Spend", totalSpend.toFixed(2)])
    csvRows.push(["Leftover", leftover.toFixed(2)])
    csvRows.push(["Usage", `${usedPercentage.toFixed(0)}%`])
    csvRows.push([])

    // Department Breakdown Section
    csvRows.push(["DEPARTMENT BREAKDOWN"])
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
      "Dept Budget (MYR)",
      "Dept Leftover (MYR)",
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
      "",
      "",
    ]
    csvRows.push(subHeader)

    // Add each department as a separate section
    for (const breakdown of monthlyData.value.departmentBreakdowns) {
      const department = breakdown.department
      const monthData = breakdown.monthData
      const totalHours = breakdown.users.reduce(
        (sum, user) => sum + user.totalHours,
        0
      )

      // Add department header
      csvRows.push([]) // Empty row for spacing
      csvRows.push([`DEPARTMENT: ${department.name}`])
      csvRows.push([]) // Empty row for spacing

      // Add department summary row
      if (totalHours > 0) {
        const deptRow = [
          `DEPARTMENT SUMMARY`,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          formatHours(totalHours),
          totalHours.toFixed(2),
          monthData.totalSpend.toFixed(2),
          monthData.retainerFee.toFixed(2),
          monthData.leftover.toFixed(2),
        ]
        csvRows.push(deptRow)
        csvRows.push([]) // Empty row for spacing
      }

      // Add user rows for this department
      for (const user of breakdown.users) {
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
            (user.weeklyHours[0] ?? 0) > 0
              ? formatHours(user.weeklyHours[0] ?? 0)
              : "-",
            (user.weeklyHours[1] ?? 0) > 0
              ? formatHours(user.weeklyHours[1] ?? 0)
              : "-",
            (user.weeklyHours[2] ?? 0) > 0
              ? formatHours(user.weeklyHours[2] ?? 0)
              : "-",
            (user.weeklyHours[3] ?? 0) > 0
              ? formatHours(user.weeklyHours[3] ?? 0)
              : "-",
            (user.weeklyHours[4] ?? 0) > 0
              ? formatHours(user.weeklyHours[4] ?? 0)
              : "-",
            formatHours(user.totalHours),
            user.totalHours.toFixed(2),
            user.totalSpend.toFixed(2),
            "", // Empty for user rows (department budget info)
            "", // Empty for user rows (department leftover info)
          ]
          csvRows.push(userRow)

          // Add time entry rows for this user
          for (const entry of user.timeEntries) {
            const hours = entry.durationSeconds / 3600
            const entryRow = [
              `  ${entry.description || "No description"}`,
              "",
              "",
              entry.weekNumber === 1 ? formatHours(hours) : "-",
              entry.weekNumber === 2 ? formatHours(hours) : "-",
              entry.weekNumber === 3 ? formatHours(hours) : "-",
              entry.weekNumber === 4 ? formatHours(hours) : "-",
              entry.weekNumber === 5 ? formatHours(hours) : "-",
              formatHours(hours),
              hours.toFixed(2),
              entry.cost.toFixed(2),
              "", // Empty for entry rows
              "", // Empty for entry rows
            ]
            csvRows.push(entryRow)
          }
        }
      }
    }

    // Add grand total row
    csvRows.push([]) // Empty row for spacing
    csvRows.push(["GRAND TOTAL"])
    csvRows.push([]) // Empty row for spacing
    const grandTotalHours = monthlyData.value.departmentBreakdowns.reduce(
      (sum, breakdown) =>
        sum +
        breakdown.users.reduce((userSum, user) => userSum + user.totalHours, 0),
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
      "", // Empty for grand total (department budget info)
      "", // Empty for grand total (department leftover info)
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

// Department cards data
const departmentCards = computed(() => {
  if (!monthlyData.value || !monthlyData.value.departmentBreakdowns) return []

  return monthlyData.value.departmentBreakdowns.map((breakdown) => ({
    department: breakdown.department,
    monthData: breakdown.monthData,
    totalHours: breakdown.users.reduce((sum, user) => sum + user.totalHours, 0),
  }))
})

// Function to get table data for a specific department
function getDepartmentTableData(departmentId: string) {
  if (!monthlyData.value || !monthlyData.value.departmentBreakdowns) return []

  const breakdown = monthlyData.value.departmentBreakdowns.find(
    (b) => b.department.id === departmentId
  )

  if (!breakdown) return []

  const data: TableRow[] = []
  const department = breakdown.department
  const monthData = breakdown.monthData

  // Calculate total hours for the department
  const totalHours = breakdown.users.reduce(
    (sum, user) => sum + user.totalHours,
    0
  )

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
    totalHours: totalHours,
    totalHoursFormatted: formatHours(totalHours),
    actualSpend: monthData.totalSpend,
    retainerFee: monthData.retainerFee,
    leftover: monthData.leftover,
    usedPercentage: monthData.usedPercentage,
    remainingPercentage: monthData.remainingPercentage,
    department: breakdown.department,
  })

  // Add user rows
  for (const user of breakdown.users) {
    data.push({
      id: `user-${user.id}`,
      name: `  ${user.name}`,
      type: "user",
      week1: user.weeklyHours[0] || 0,
      week2: user.weeklyHours[1] || 0,
      week3: user.weeklyHours[2] || 0,
      week4: user.weeklyHours[3] || 0,
      week5: user.weeklyHours[4] || 0,
      totalHours: user.totalHours,
      totalHoursFormatted: formatHours(user.totalHours),
      actualSpend: user.totalSpend,
      retainerFee: monthData.retainerFee,
      leftover: monthData.leftover,
      usedPercentage: monthData.usedPercentage,
      remainingPercentage: monthData.remainingPercentage,
      user,
    })

    // Add time entry rows
    for (const entry of user.timeEntries) {
      const hours = entry.durationSeconds / 3600
      data.push({
        id: `entry-${entry.id}`,
        name: `    ${entry.description || "No description"}`,
        type: "entry",
        week1: entry.weekNumber === 1 ? hours : 0,
        week2: entry.weekNumber === 2 ? hours : 0,
        week3: entry.weekNumber === 3 ? hours : 0,
        week4: entry.weekNumber === 4 ? hours : 0,
        week5: entry.weekNumber === 5 ? hours : 0,
        totalHours: hours,
        totalHoursFormatted: formatHours(hours),
        actualSpend: entry.cost,
        retainerFee: monthData.retainerFee,
        leftover: monthData.leftover,
        usedPercentage: monthData.usedPercentage,
        remainingPercentage: monthData.remainingPercentage,
        entry,
      })
    }
  }

  return data
}

// Table data processing
const tableData = computed(() => {
  if (!monthlyData.value || !monthlyData.value.departmentBreakdowns) return []

  const data: TableRow[] = []

  for (const breakdown of monthlyData.value.departmentBreakdowns) {
    const department = breakdown.department
    const monthData = breakdown.monthData

    // Calculate total hours for the department
    const totalHours = breakdown.users.reduce(
      (sum, user) => sum + user.totalHours,
      0
    )

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
      totalHours: totalHours,
      totalHoursFormatted: formatHours(totalHours),
      actualSpend: monthData.totalSpend,
      retainerFee: monthData.retainerFee,
      leftover: monthData.leftover,
      usedPercentage: monthData.usedPercentage,
      remainingPercentage: monthData.remainingPercentage,
      department: breakdown.department,
    })

    // Don't add department cards as table rows - we'll render them separately

    // Add user rows
    for (const user of breakdown.users) {
      data.push({
        id: `user-${user.id}`,
        name: `  ${user.name}`,
        type: "user",
        week1: user.weeklyHours[0] || 0,
        week2: user.weeklyHours[1] || 0,
        week3: user.weeklyHours[2] || 0,
        week4: user.weeklyHours[3] || 0,
        week5: user.weeklyHours[4] || 0,
        totalHours: user.totalHours,
        totalHoursFormatted: formatHours(user.totalHours),
        actualSpend: user.totalSpend,
        retainerFee: monthData.retainerFee,
        leftover: monthData.leftover,
        usedPercentage: monthData.usedPercentage,
        remainingPercentage: monthData.remainingPercentage,
        user,
      })

      // Add time entry rows
      for (const entry of user.timeEntries) {
        const hours = entry.durationSeconds / 3600
        data.push({
          id: `entry-${entry.id}`,
          name: `    ${entry.description || "No description"}`,
          type: "entry",
          week1: entry.weekNumber === 1 ? hours : 0,
          week2: entry.weekNumber === 2 ? hours : 0,
          week3: entry.weekNumber === 3 ? hours : 0,
          week4: entry.weekNumber === 4 ? hours : 0,
          week5: entry.weekNumber === 5 ? hours : 0,
          totalHours: hours,
          totalHoursFormatted: formatHours(hours),
          actualSpend: entry.cost,
          retainerFee: monthData.retainerFee,
          leftover: monthData.leftover,
          usedPercentage: monthData.usedPercentage,
          remainingPercentage: monthData.remainingPercentage,
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
  {
    accessorKey: "retainerFee",
    header: "DEPT BUDGET",
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
              ? "font-bold text-lg text-blue-400"
              : "text-base text-blue-300",
            value > 0 ? "bg-blue-900/20 px-2 py-1 rounded" : "",
          ],
        },
        isDepartment ? `$${value.toFixed(2)}` : "-"
      )
    },
  },
  {
    accessorKey: "leftover",
    header: "DEPT LEFTOVER",
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
            value >= 0 ? "text-green-400" : "text-red-400",
            value !== 0 ? "bg-green-900/20 px-2 py-1 rounded" : "",
          ],
        },
        isDepartment ? `$${value.toFixed(2)}` : "-"
      )
    },
  },
]
</script>

<template>
  <div class="monthly-breakdown">
    <!-- Overall Project Summary Section -->
    <div class="mb-12">
      <h2 class="text-2xl font-bold text-gray-100 mb-6">
        Overall Project Summary
      </h2>
      <!-- Overall Project Summary Cards (lifetime, shown always) -->
      <div
        v-if="lifetimeData && lifetimeData.lifetimeData"
        class="grid grid-cols-1 md:grid-cols-4 gap-6"
      >
        <UCard
          class="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border-blue-500/20"
        >
          <template #header>
            <div class="text-sm font-medium text-blue-300">Total Budget</div>
          </template>
          <div class="text-3xl font-bold text-blue-400">
            ${{ lifetimeData.lifetimeData.totalBudget.toFixed(2) }}
          </div>
        </UCard>

        <UCard
          class="bg-gradient-to-br from-orange-900/20 to-orange-800/10 border-orange-500/20"
        >
          <template #header>
            <div class="text-sm font-medium text-orange-300">Total Spend</div>
          </template>
          <div class="text-3xl font-bold text-orange-400">
            ${{ lifetimeData.lifetimeData.totalSpend.toFixed(2) }}
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
            :class="
              lifetimeData.lifetimeData.leftover >= 0
                ? 'text-green-400'
                : 'text-red-400'
            "
          >
            ${{ lifetimeData.lifetimeData.leftover.toFixed(2) }}
          </div>
        </UCard>

        <UCard
          class="bg-gradient-to-br from-purple-900/20 to-purple-800/10 border-purple-500/20"
        >
          <template #header>
            <div class="text-sm font-medium text-purple-300">Used</div>
          </template>
          <div class="text-3xl font-bold text-purple-400">
            {{ lifetimeData.lifetimeData.usedPercentage }}%
          </div>
        </UCard>
      </div>
    </div>

    <!-- Monthly Breakdown Section -->
    <div class="mb-8">
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

      <!-- Monthly Summary Cards -->
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
            ${{ monthlyData.overallMonthData.retainerFee.toFixed(2) }}
          </div>
        </UCard>

        <UCard
          class="bg-gradient-to-br from-red-900/20 to-red-800/10 border-red-500/20"
        >
          <template #header>
            <div class="text-sm font-medium text-red-300">Actual Spend</div>
          </template>
          <div class="text-3xl font-bold text-red-400">
            ${{ monthlyData.overallMonthData.totalSpend.toFixed(2) }}
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
            ${{ monthlyData.overallMonthData.leftover.toFixed(2) }}
          </div>
        </UCard>

        <UCard
          class="bg-gradient-to-br from-purple-900/20 to-purple-800/10 border-purple-500/20"
        >
          <template #header>
            <div class="text-sm font-medium text-purple-300">Usage</div>
          </template>
          <div class="text-3xl font-bold text-purple-400">
            {{ monthlyData.overallMonthData.usedPercentage }}%
          </div>
        </UCard>
      </div>

      <!-- Department Tables -->
      <div
        v-if="monthlyData && departmentCards.length > 0"
        class="space-y-8"
      >
        <div
          v-for="cardData in departmentCards"
          :key="cardData.department.id"
          class="space-y-4"
        >
          <!-- Department Header with Summary Cards -->
          <div class="bg-gray-800/20 rounded-lg p-6 border border-gray-600/20">
            <h4 class="text-xl font-bold text-gray-100 mb-6">
              {{ cardData.department.name }}
            </h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
              <!-- Department Fee Card -->
              <div
                class="bg-gray-900/50 border border-gray-600/30 rounded-lg p-2"
              >
                <div class="text-xs font-medium text-gray-300 mb-1">
                  Department Fee
                </div>
                <div class="text-sm font-bold text-gray-100">
                  ${{ cardData.monthData.retainerFee.toFixed(2) }}
                </div>
              </div>

              <!-- Actual Spend Card -->
              <div
                class="bg-gray-900/50 border border-red-500/30 rounded-lg p-2"
              >
                <div class="text-xs font-medium text-red-300 mb-1">
                  Actual Spend
                </div>
                <div class="text-sm font-bold text-red-400">
                  ${{ cardData.monthData.totalSpend.toFixed(2) }}
                </div>
              </div>

              <!-- Leftover Card -->
              <div
                class="bg-gray-900/50 border border-green-500/30 rounded-lg p-2"
              >
                <div class="text-xs font-medium text-green-300 mb-1">
                  Leftover
                </div>
                <div
                  class="text-sm font-bold"
                  :class="
                    cardData.monthData.leftover >= 0
                      ? 'text-green-400'
                      : 'text-red-400'
                  "
                >
                  ${{ cardData.monthData.leftover.toFixed(2) }}
                </div>
              </div>

              <!-- Usage Card -->
              <div
                class="bg-gray-900/50 border border-purple-500/30 rounded-lg p-2"
              >
                <div class="text-xs font-medium text-purple-300 mb-1">
                  Usage
                </div>
                <div class="text-sm font-bold text-purple-400">
                  {{ cardData.monthData.usedPercentage }}%
                </div>
              </div>
            </div>
          </div>

          <!-- Department Table -->
          <div
            v-if="getDepartmentTableData(cardData.department.id).length > 0"
            class="bg-gray-900/50 rounded-lg border border-gray-700/50 overflow-hidden"
          >
            <UTable
              :data="getDepartmentTableData(cardData.department.id)"
              :columns="tableColumns"
              :loading="status === 'pending'"
              :ui="{
                thead: 'bg-gray-800/50',
                tbody: 'divide-y divide-gray-700/50',
                tr: 'hover:bg-gray-800/30 transition-colors',
                th: 'px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider',
                td: 'px-4 py-3 text-sm text-gray-200',
              }"
            />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="monthlyData && departmentCards.length === 0"
        class="text-center py-12"
      >
        <Icon
          name="i-heroicons-calendar-days"
          class="w-16 h-16 mx-auto mb-6 text-gray-400"
        />
        <p class="text-xl font-semibold mb-2 text-gray-200">
          No Data Available
        </p>
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

      <!-- Department Budget Splits Section -->
      <div class="mt-8">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-semibold text-gray-200">
            Department Budget Splits
          </h3>
          <UButton
            icon="i-heroicons-plus-circle"
            size="sm"
            variant="solid"
            label="Add Split"
            @click="openAddSplitModal"
          />
        </div>

        <!-- Department Splits Table -->
        <div
          v-if="departmentSplits.length > 0"
          class="bg-gray-900/50 rounded-lg border border-gray-700/50 overflow-hidden"
        >
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-800/50">
                <tr>
                  <th
                    class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                  >
                    Department
                  </th>
                  <th
                    class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                  >
                    Budget Amount
                  </th>
                  <th
                    class="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-700/50">
                <tr
                  v-for="split in departmentSplits"
                  :key="split.id"
                  class="hover:bg-gray-800/30 transition-colors"
                >
                  <td class="px-4 py-3 text-sm text-gray-200">
                    {{ split.departmentName }}
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-200 font-mono">
                    ${{ parseFloat(split.budgetAmount).toFixed(2) }}
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-200">
                    <div class="flex items-center space-x-2">
                      <UButton
                        icon="i-heroicons-pencil-square"
                        size="sm"
                        color="warning"
                        variant="outline"
                        @click="openEditSplitModal(split)"
                      />
                      <UButton
                        icon="i-heroicons-trash"
                        size="sm"
                        color="error"
                        variant="outline"
                        @click="openDeleteSplitModal(split)"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Empty State for Department Splits -->
        <div
          v-else
          class="text-center py-8"
        >
          <Icon
            name="i-heroicons-building-office-2"
            class="w-12 h-12 mx-auto mb-4 text-gray-400"
          />
          <p class="text-lg font-medium mb-2 text-gray-200">
            No Department Budget Splits
          </p>
          <p class="text-sm text-gray-400 mb-4">
            Add department budget splits to allocate project budget across
            different departments.
          </p>
          <UButton
            icon="i-heroicons-plus-circle"
            size="sm"
            variant="solid"
            label="Add First Split"
            @click="openAddSplitModal"
          />
        </div>
      </div>
    </div>

    <!-- Department Budget Split Modals -->
    <!-- Add Split Modal -->
    <UModal v-model:open="isAddSplitModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold">Add Department Budget Split</h3>
          </template>
          <div class="space-y-4">
            <UFormField
              label="Department"
              required
            >
              <USelectMenu
                v-model="newSplitDepartment"
                :items="availableDepartments"
                value-key="id"
                label-key="name"
                placeholder="Select a department"
                searchable
              />
            </UFormField>
            <UFormField
              label="Budget Amount"
              required
            >
              <UInput
                v-model.number="newSplitData.budgetAmount"
                type="number"
                step="0.01"
                placeholder="Enter budget amount"
              >
                <template #leading>
                  <Icon
                    name="i-heroicons-currency-dollar"
                    class="w-4 h-4"
                  />
                </template>
              </UInput>
            </UFormField>
            <div class="flex justify-end gap-2 mt-6">
              <UButton
                label="Cancel"
                variant="ghost"
                @click="isAddSplitModalOpen = false"
              />
              <UButton
                label="Add Split"
                @click="handleAddSplit"
              />
            </div>
          </div>
        </UCard>
      </template>
    </UModal>

    <!-- Edit Split Modal -->
    <UModal v-model:open="isEditSplitModalOpen">
      <template #content>
        <UCard v-if="selectedSplit">
          <template #header>
            <h3 class="text-lg font-semibold">Edit Department Budget Split</h3>
          </template>
          <div class="space-y-4">
            <UFormField
              label="Department"
              required
            >
              <USelectMenu
                v-model="editSplitDepartment"
                :items="availableDepartments"
                value-key="id"
                label-key="name"
                placeholder="Select a department"
                searchable
              />
            </UFormField>
            <UFormField
              label="Budget Amount"
              required
            >
              <UInput
                v-model.number="editSplitData.budgetAmount"
                type="number"
                step="0.01"
                placeholder="Enter budget amount"
              >
                <template #leading>
                  <Icon
                    name="i-heroicons-currency-dollar"
                    class="w-4 h-4"
                  />
                </template>
              </UInput>
            </UFormField>
            <div class="flex justify-end gap-2 mt-6">
              <UButton
                label="Cancel"
                variant="ghost"
                @click="isEditSplitModalOpen = false"
              />
              <UButton
                label="Update Split"
                @click="handleUpdateSplit"
              />
            </div>
          </div>
        </UCard>
      </template>
    </UModal>

    <!-- Delete Split Modal -->
    <UModal v-model:open="isDeleteSplitModalOpen">
      <template #content>
        <UCard v-if="selectedSplit">
          <template #header>
            <h3 class="text-lg font-semibold">
              Delete Department Budget Split
            </h3>
          </template>
          <div class="space-y-4">
            <p class="text-gray-300">
              Are you sure you want to delete the budget split for
              <span class="font-semibold">
                {{ selectedSplit.departmentName }}
              </span>
              (${parseFloat(selectedSplit.budgetAmount).toFixed(2)})?
            </p>
            <p class="text-sm text-gray-400">This action cannot be undone.</p>
            <div class="flex justify-end gap-2 mt-6">
              <UButton
                label="Cancel"
                variant="ghost"
                @click="isDeleteSplitModalOpen = false"
              />
              <UButton
                label="Delete Split"
                color="error"
                @click="handleDeleteSplit"
              />
            </div>
          </div>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
