<template>
  <Line
    :data="chartData"
    :options="chartOptions"
  />
</template>

<script setup lang="ts">
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement, // For the line itself
  PointElement, // For points on the line
  CategoryScale, // Often used for X axis (time, categories)
  LinearScale, // Often used for Y axis (values)
  TimeScale, // Specifically for time-based X axis
  type ChartData,
  type ChartOptions,
  type Point, // Import Point type
} from "chart.js"
import "chartjs-adapter-dayjs-4" // Use dayjs adapter
import { Line } from "vue-chartjs"

// Register necessary Chart.js components
ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  TimeScale // Register the time scale
)

// Basic expected structure for data items (can be reused or specialized)
interface ChartDataItem {
  [key: string]: string | number | Date | null | undefined
}

interface Props {
  data: ChartDataItem[] // Raw data from API
  labelField: string // Field for chart labels (often a time field like 'timePeriod')
  valueField: string // Field for chart values (e.g., 'totalDuration')
  chartTitle: string
  valueAxisLabel?: string
  categoryAxisLabel?: string // Or timeAxisLabel?
  timeUnit?: "day" | "week" | "month" | "year" // For time scale formatting
}

const props = withDefaults(defineProps<Props>(), {
  valueAxisLabel: "Value",
  categoryAxisLabel: "Time", // Default X axis label
  timeUnit: "day",
})

const chartData = computed((): ChartData<"line"> => {
  const processedData: Point[] = props.data.map((item) => {
    const xValueRaw = item[props.labelField]
    const yValueRaw = item[props.valueField]

    // Ensure x is a timestamp (number)
    const xDate =
      xValueRaw instanceof Date
        ? xValueRaw
        : new Date(String(xValueRaw ?? Date.now()))
    const xValue = xDate.getTime() // Convert Date to timestamp

    // Ensure y is a number
    const yValueNumber = Number(yValueRaw)
    const yValueInSeconds = isNaN(yValueNumber) ? 0 : yValueNumber
    const yValue = yValueInSeconds / 60 // Convert seconds to minutes

    // Explicitly return as Point type {x: number, y: number}
    return { x: xValue, y: yValue }
  })

  // Sort the data by the x value (timestamp)
  processedData.sort((a, b) => a.x - b.x)

  return {
    datasets: [
      {
        label: props.chartTitle,
        backgroundColor: "#3b82f6", // Example blue color
        borderColor: "#3b82f6",
        tension: 0.1, // Increased tension for a smoother curve
        data: processedData, // Use the sorted, pre-processed data
      },
    ],
  }
})

const chartOptions = computed((): ChartOptions<"line"> => {
  return {
    responsive: true,
    maintainAspectRatio: false,
    parsing: false, // Important: Disable automatic parsing since we provide {x, y} objects
    plugins: {
      legend: {
        display: false,
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
          display: !!props.valueAxisLabel,
          text: props.valueAxisLabel,
        },
      },
      x: {
        type: "time", // Use time scale
        time: {
          unit: props.timeUnit, // Control display unit based on data granularity
          tooltipFormat: "PPpp", // Format for tooltips (requires date-fns)
          displayFormats: {
            // Control how labels are displayed on the axis
            day: "MMM d",
            week: "MMM d yyyy",
            month: "MMM yyyy",
            year: "yyyy",
          },
        },
        title: {
          display: !!props.categoryAxisLabel,
          text: props.categoryAxisLabel,
        },
      },
    },
  }
})
</script>
