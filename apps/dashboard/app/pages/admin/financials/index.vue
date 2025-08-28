<script lang="ts" setup>
import type { ColumnDef } from "@tanstack/vue-table"

definePageMeta({
  middleware: "admin",
})

useSeoMeta({
  title: "Timesheet | Admin Financials",
  description: "Financial overview and reporting for the application",
})

const { $eden, $dayjs } = useNuxtApp()

// Filter state
const startDate = ref($dayjs().startOf("month").format("YYYY-MM-DD"))
const endDate = ref($dayjs().endOf("month").format("YYYY-MM-DD"))
const selectedProject = ref<
  { label: string; value: string | undefined } | undefined
>(undefined)

// Projects for filter dropdown
const { data: projectsResponse } = await useLazyAsyncData(
  "projects-for-filter",
  async () => {
    const { data } = await $eden.api.projects.get({
      query: {
        isActive: true,
      },
    })
    return data
  }
)

// Financial data
const {
  data: financialData,
  status,
  refresh,
} = await useLazyAsyncData(
  "financials-overview",
  async () => {
    const { data } = await $eden.api.admin.financials.get({
      query: {
        startDate: startDate.value,
        endDate: endDate.value,
        projectId: selectedProject.value?.value,
      },
    })
    return data
  },
  {
    watch: [startDate, endDate, selectedProject],
  }
)

// Table columns
const columns: ColumnDef<Record<string, unknown>, unknown>[] = [
  {
    accessorKey: "team",
    header: "Team",
  },
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
    accessorKey: "week5",
    header: "Week 5",
  },
  {
    accessorKey: "totalHours",
    header: "Total Hours",
  },
  {
    accessorKey: "decimalHours",
    header: "Decimal Hours",
  },
  {
    accessorKey: "cost",
    header: "Cost (MYR)",
    cell: ({ getValue }) => {
      const cost = getValue() as string
      return h("span", { class: "font-mono" }, `$${cost}`)
    },
  },
]

// Computed properties
const projects = computed(() => financialData.value?.projects ?? [])

// Project options for filter
const projectOptions = computed(() => {
  if (!projectsResponse.value?.projects) return []
  return [
    { label: "All Projects", value: undefined },
    ...projectsResponse.value.projects.map(
      (project: { name: string; id: string }) => ({
        label: project.name,
        value: project.id,
      })
    ),
  ]
})

// Loading state
const isLoading = computed(() => status.value === "pending")

// Handle filter changes
function handleFilterChange() {
  refresh()
}

// Export to CSV function
function exportToCSV() {
  if (!financialData.value?.projects) return

  // CSV headers for user data
  const userHeaders = [
    "Team",
    "Week 1",
    "Week 2",
    "Week 3",
    "Week 4",
    "Week 5",
    "Total Hours",
    "Decimal Hours",
    "Cost (MYR)",
  ]

  // CSV rows
  const csvRows: string[] = []

  // Process each project
  financialData.value.projects.forEach((project) => {
    // Add project section header
    csvRows.push("") // Empty row for spacing
    csvRows.push(`"${project.projectName}" Project`)
    csvRows.push("") // Empty row for spacing

    // Add project summary
    csvRows.push("Metric,Value")
    csvRows.push(`"Revenue","$${project.revenue}"`)
    csvRows.push(`"Profit","$${project.profit}"`)
    csvRows.push(`"Used","${project.usedPercentage}"`)
    csvRows.push(`"Margins","${project.marginsPercentage}"`)
    csvRows.push("") // Empty row for spacing

    // Add user data headers
    csvRows.push(userHeaders.join(","))

    // Add user data rows
    project.users.forEach((user) => {
      const row = [
        `"${user.team}"`,
        user.week1 || "-",
        user.week2 || "-",
        user.week3 || "-",
        user.week4 || "-",
        user.week5 || "-",
        user.totalHours,
        user.decimalHours,
        user.cost,
      ]
      csvRows.push(row.join(","))
    })

    // Add project totals row
    const totalHours = project.users.reduce(
      (sum, user) => sum + parseFloat(user.decimalHours?.toString() || "0"),
      0
    )
    const totalCost = project.users.reduce(
      (sum, user) => sum + parseFloat(user.cost?.toString() || "0"),
      0
    )

    const totalsRow = [
      '"TOTAL"',
      "-",
      "-",
      "-",
      "-",
      "-",
      `"${formatHours(totalHours)}"`,
      totalHours.toFixed(2),
      totalCost.toFixed(2),
    ]
    csvRows.push(totalsRow.join(","))
  })

  // Create and download CSV file
  const csvContent = csvRows.join("\n")
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute(
    "download",
    `financial-report-${startDate.value}-to-${endDate.value}.csv`
  )
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Helper function to format decimal hours to HH:mm format
function formatHours(decimalHours: number): string {
  const hours = Math.floor(decimalHours)
  const minutes = Math.round((decimalHours - hours) * 60)
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`
}
</script>

<template>
  <div>
    <UCard>
      <template #header>
        <div
          class="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
        >
          <div>
            <h2 class="text-xl font-bold">Financial Overview</h2>
            <div class="text-sm text-gray-500">
              Time tracking and cost analysis by team and project
            </div>
          </div>
        </div>
      </template>

      <!-- Filters -->
      <div class="mb-6 p-4 rounded-lg">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <UFormField label="Start Date">
            <UInput
              v-model="startDate"
              type="date"
              @change="handleFilterChange"
            />
          </UFormField>

          <UFormField label="End Date">
            <UInput
              v-model="endDate"
              type="date"
              @change="handleFilterChange"
            />
          </UFormField>

          <UFormField label="Project">
            <USelectMenu
              v-model="selectedProject"
              :items="projectOptions"
              placeholder="Select project"
              @change="handleFilterChange"
            />
          </UFormField>

          <div class="flex items-end gap-2">
            <UButton
              icon="i-heroicons-arrow-path"
              label="Refresh"
              :loading="isLoading"
              @click="() => refresh()"
            />
            <UButton
              icon="i-heroicons-arrow-down-tray"
              label="Export CSV"
              variant="outline"
              :disabled="!financialData?.projects?.length"
              @click="exportToCSV"
            />
          </div>
        </div>
      </div>

      <!-- Project Tables -->
      <div
        v-if="projects.length > 0"
        class="space-y-8"
      >
        <div
          v-for="project in projects"
          :key="project.projectId"
          class="mt-8"
        >
          <UCard>
            <template #header>
              <div class="flex justify-between items-center">
                <h3 class="text-lg font-semibold">{{ project.projectName }}</h3>
                <div class="flex flex-wrap gap-2 text-sm">
                  <div class="rounded px-2 py-1 bg-blue-100 text-blue-800">
                    Revenue: ${{ project.revenue }}
                  </div>
                  <div class="rounded px-2 py-1 bg-green-100 text-green-800">
                    Profit: ${{ project.profit }}
                  </div>
                  <div class="rounded px-2 py-1 bg-orange-100 text-orange-800">
                    Used: {{ project.usedPercentage }}
                  </div>
                  <div class="rounded px-2 py-1 bg-purple-100 text-purple-800">
                    Margins: {{ project.marginsPercentage }}
                  </div>
                </div>
              </div>
            </template>

            <UTable
              :data="project.users"
              :columns="columns"
              :loading="isLoading"
              :empty-state="{
                icon: 'i-heroicons-circle-stack-20-solid',
                label: 'No users found for this project.',
              }"
              class="mt-4"
            />
          </UCard>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!isLoading"
        class="text-center text-gray-500 py-8"
      >
        <Icon
          name="i-heroicons-circle-stack-20-solid"
          class="w-12 h-12 mx-auto mb-4 text-gray-300"
        />
        <p class="text-lg font-medium mb-2">No Financial Data</p>
        <p class="text-sm">
          No financial data available for the selected filters.
        </p>
      </div>
    </UCard>
  </div>
</template>
