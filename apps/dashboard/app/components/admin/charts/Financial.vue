<script lang="ts" setup>
import { Bar } from "vue-chartjs"
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  type ChartOptions,
  type ChartData,
} from "chart.js"
ChartJS.register(
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement
)

const props = defineProps<{
  costOverTime: { month: string; cost: number }[]
  budgetInjections: { amount: number; date: string }[]
  projectName?: string
}>()

const months = computed(() => props.costOverTime.map((e) => e.month))
const cumulativeCosts = computed(() => {
  let total = 0
  return props.costOverTime.map((e) => (total += e.cost))
})
const cumulativeBudget = computed(() => {
  return months.value.map((month) =>
    props.budgetInjections
      .filter((b) => b.date.slice(0, 7) <= month)
      .reduce((sum, b) => sum + b.amount, 0)
  )
})
const totalBudget = computed(() =>
  props.budgetInjections.reduce((sum, b) => sum + b.amount, 0)
)
const profitOverTime = computed(() => {
  let profit = totalBudget.value
  return props.costOverTime.map((e) => {
    profit -= e.cost
    return profit
  })
})

// See: https://github.com/apertureless/vue-chartjs/issues/1048
const chartData = computed(() => ({
  labels: months.value,
  datasets: [
    {
      label: "Cumulative Cost",
      data: cumulativeCosts.value,
      backgroundColor: "rgba(248, 113, 113, 0.2)",
      borderColor: "rgba(248, 113, 113, 1)",
      borderWidth: 2,
      type: "bar",
    },
    {
      label: "Profit",
      data: profitOverTime.value,
      backgroundColor: "#34d399",
      borderColor: "#34d399",
      type: "line",
      fill: false,
      tension: 0.4,
    },
    {
      label: "Budget",
      data: cumulativeBudget.value,
      backgroundColor: "#60a5fa",
      borderColor: "#60a5fa",
      type: "line",
      borderDash: [5, 5],
      fill: false,
      pointRadius: 0,
      tension: 0.2,
    },
  ] satisfies ChartData<"bar" | "line">["datasets"],
})) // See: https://github.com/apertureless/vue-chartjs/issues/1048

const chartOptions = computed(
  (): ChartOptions<"bar" | "line"> => ({
    responsive: true,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: props.projectName
          ? `${props.projectName} Financials`
          : "Project Cost & Profit Over Time",
      },
    },
    scales: {
      y: { beginAtZero: true },
    },
  })
)
</script>

<template>
  <div>
    <!-- @vue-expect-error: Mixed chart types are not supported -->
    <Bar
      :data="chartData"
      :options="chartOptions"
    />
  </div>
</template>
