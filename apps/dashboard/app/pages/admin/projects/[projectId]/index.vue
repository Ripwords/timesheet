<script lang="ts" setup>
definePageMeta({
  middleware: "admin",
})

const route = useRoute("admin-projects-projectId")
const { projectId } = route.params
const { $eden } = useNuxtApp()

const { data: projectDetails, status } = await useLazyAsyncData(
  projectId ? `project-financials-${projectId}` : "project-financials-invalid",
  async () => {
    if (!projectId) {
      console.error("Cannot fetch financials without a valid project ID")
      return null // Prevent API call if ID is invalid
    }
    try {
      const { data, error } = await $eden.api.admin
        .financials({
          projectId,
        })
        .get()

      if (error) {
        console.error("Error fetching project financials:", error.value)
        return null // Return null on API error
      }
      return data
    } catch (e) {
      console.error("Exception during financial data fetch:", e)
      return null
    }
  }
)

// Computed properties with explicit types and null checks
const budgetInjections = computed(
  () => projectDetails.value?.budgetInjections ?? []
)
const costOverTime = computed(() => projectDetails.value?.costOverTime ?? [])

const totalBudget = computed(() => {
  return budgetInjections.value.reduce((sum: number, b) => sum + b.amount, 0)
})

const totalCost = computed(() => {
  return costOverTime.value.reduce((sum: number, e) => sum + e.cost, 0)
})

const currentProfit = computed(() => totalBudget.value - totalCost.value)
</script>

<template>
  <div>
    <!-- Loading State -->
    <div
      v-if="status === 'pending'"
      class="text-center py-10"
    >
      Loading project financials...
    </div>

    <!-- Error State -->
    <div
      v-else-if="status === 'error' || !projectDetails"
      class="text-center py-10 text-red-500"
    >
      Failed to load project financials. Please try again later.
      <!-- {{ fetchError?.message }} -->
    </div>

    <!-- Success State -->
    <UCard v-else-if="status === 'success' && projectDetails">
      <template #header>
        <div
          class="flex flex-col md:flex-row md:items-center md:justify-between gap-2"
        >
          <div>
            <h2 class="text-xl font-bold">{{ projectDetails.projectName }}</h2>
            <div class="text-sm text-gray-500">Project Financial Overview</div>
          </div>
          <div class="flex flex-col md:flex-row gap-2 mt-2 md:mt-0">
            <div
              class="bg-blue-100 text-blue-800 rounded px-3 py-1 text-sm font-semibold"
            >
              Budget: ${{ totalBudget.toFixed(2) }}
            </div>
            <div
              class="bg-red-100 text-red-800 rounded px-3 py-1 text-sm font-semibold"
            >
              Cost: ${{ totalCost.toFixed(2) }}
            </div>
            <div
              :class="[
                'rounded px-3 py-1 text-sm font-semibold',
                currentProfit >= 0
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800',
              ]"
            >
              Profit: ${{ currentProfit.toFixed(2) }}
            </div>
          </div>
        </div>
      </template>
      <div class="my-8">
        <AdminChartsFinancial
          v-if="costOverTime.length > 0 || budgetInjections.length > 0"
          :cost-over-time="costOverTime"
          :budget-injections="budgetInjections"
          :project-name="projectDetails.projectName"
        />
        <div
          v-else
          class="text-center text-gray-500"
        >
          No financial data available to display chart.
        </div>
      </div>
      <div class="mt-6">
        <h3 class="font-semibold mb-2">Budget Injections</h3>
        <ul
          v-if="budgetInjections.length > 0"
          class="divide-y divide-gray-200"
        >
          <li
            v-for="b in budgetInjections"
            :key="b.id"
            class="py-2 flex justify-between items-center"
          >
            <div>
              <span class="font-medium">{{ b.date }}</span>
              :
              <span>{{ b.description }}</span>
            </div>
            <span class="font-mono">${{ b.amount.toFixed(2) }}</span>
          </li>
        </ul>
        <div
          v-else
          class="text-gray-500"
        >
          No budget injections recorded.
        </div>
      </div>
    </UCard>
  </div>
</template>
