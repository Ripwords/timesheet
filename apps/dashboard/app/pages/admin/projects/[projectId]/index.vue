<script lang="ts" setup>
// Mock project data
const project = ref({
  id: 1,
  name: "Acme Website Redesign",
  budgetInjections: [
    { id: 1, amount: 5000, date: "2024-01-01" },
    { id: 2, amount: 2000, date: "2024-03-01" },
  ],
})

// Mock cost data (monthly)
const costOverTime = ref([
  { month: "2024-01", cost: 1200 },
  { month: "2024-02", cost: 1800 },
  { month: "2024-03", cost: 900 },
  { month: "2024-04", cost: 700 },
])

const totalBudget = computed(() =>
  project.value.budgetInjections.reduce((sum, b) => sum + b.amount, 0)
)
const totalCost = computed(() =>
  costOverTime.value.reduce((sum, e) => sum + e.cost, 0)
)
const currentProfit = computed(() => totalBudget.value - totalCost.value)
</script>

<template>
  <UCard>
    <template #header>
      <div
        class="flex flex-col md:flex-row md:items-center md:justify-between gap-2"
      >
        <div>
          <h2 class="text-xl font-bold">{{ project.name }}</h2>
          <div class="text-sm text-gray-500">Project Financial Overview</div>
        </div>
        <div class="flex flex-col md:flex-row gap-2 mt-2 md:mt-0">
          <div
            class="bg-blue-100 text-blue-800 rounded px-3 py-1 text-sm font-semibold"
          >
            Budget: ${{ totalBudget }}
          </div>
          <div
            class="bg-red-100 text-red-800 rounded px-3 py-1 text-sm font-semibold"
          >
            Cost: ${{ totalCost }}
          </div>
          <div
            class="bg-green-100 text-green-800 rounded px-3 py-1 text-sm font-semibold"
          >
            Profit: ${{ currentProfit }}
          </div>
        </div>
      </div>
    </template>
    <div class="my-8">
      <AdminChartsFinancial
        :cost-over-time="costOverTime"
        :budget-injections="project.budgetInjections"
        :project-name="project.name"
      />
    </div>
    <div class="mt-6">
      <h3 class="font-semibold mb-2">Budget Injections</h3>
      <ul class="divide-y divide-gray-200">
        <li
          v-for="b in project.budgetInjections"
          :key="b.id"
          class="py-2 flex justify-between"
        >
          <span>{{ b.date }}: </span>
          <span class="font-mono">${{ b.amount }}</span>
        </li>
      </ul>
    </div>
  </UCard>
</template>
