<script setup lang="ts">
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  type ChartData,
  type ChartOptions,
} from "chart.js"
import { Bar } from "vue-chartjs"

// Register necessary Chart.js components
ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

// Basic expected structure for data items
interface ChartDataItem {
  [key: string]: string | number | Date | null | undefined
}

interface Props {
  data: ChartDataItem[] // Use the interface instead of any[]
  labelField: string // Field for chart labels (e.g., 'name' or 'email')
  valueField: string // Field for chart values (e.g., 'totalDuration')
  chartTitle: string
  valueAxisLabel?: string
  categoryAxisLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  valueAxisLabel: "Value",
  categoryAxisLabel: "Category",
})

const chartData = computed((): ChartData<"bar"> => {
  // Ensure labels are strings and abbreviate if necessary
  const labels = props.data.map((item) => {
    const rawLabel = String(item[props.labelField] ?? "Unknown")
    const maxLength = 15 // Maximum label length
    return rawLabel.length > maxLength
      ? `${rawLabel.substring(0, maxLength)}...`
      : rawLabel
  })

  // Ensure data values are numbers and convert seconds to minutes
  const dataValues = props.data.map((item) => {
    const value = item[props.valueField]
    // Attempt to convert to number, default to 0 if conversion fails or value is null/undefined
    const numValueInSeconds = Number(value)
    const seconds = isNaN(numValueInSeconds) ? 0 : numValueInSeconds
    return seconds / 60 // Convert to minutes
  })

  return {
    labels: labels,
    datasets: [
      {
        label: props.chartTitle,
        backgroundColor: "#4ade80", // Tailwind green-500
        data: dataValues,
      },
    ],
  }
})

const chartOptions = computed((): ChartOptions<"bar"> => {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false, // Often redundant if title is clear
      },
      title: {
        display: true,
        text: props.chartTitle,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: !!props.valueAxisLabel, // Only display if label provided
          text: props.valueAxisLabel,
        },
      },
      x: {
        title: {
          display: !!props.categoryAxisLabel, // Only display if label provided
          text: props.categoryAxisLabel,
        },
      },
    },
  }
})
</script>

<template>
  <Bar
    :data="chartData"
    :options="chartOptions"
  />
</template>
