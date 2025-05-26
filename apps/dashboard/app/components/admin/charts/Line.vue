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
import { useDayjs } from "#dayjs" // Import dayjs

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

const dayjs = useDayjs() // Get dayjs instance

const chartData = computed((): ChartData<"line"> => {
  if (!props.data || props.data.length === 0) {
    return { datasets: [] }
  }

  // 1. Map existing data and find min/max dates
  const existingDataMap = new Map<number, number>()
  let minDate = Infinity
  let maxDate = -Infinity

  props.data.forEach((item) => {
    const xValueRaw = item[props.labelField]
    const yValueRaw = item[props.valueField]

    const xDate = dayjs(
      xValueRaw instanceof Date ? xValueRaw : String(xValueRaw ?? Date.now())
    )
    if (!xDate.isValid()) return // Skip invalid dates

    const xTimestamp = xDate.startOf(props.timeUnit).valueOf() // Align timestamp to the start of the unit
    const yValueNumber = Number(yValueRaw)
    const yValueInSeconds = isNaN(yValueNumber) ? 0 : yValueNumber
    const yValueInMinutes = yValueInSeconds / 60

    existingDataMap.set(xTimestamp, yValueInMinutes)
    minDate = Math.min(minDate, xTimestamp)
    maxDate = Math.max(maxDate, xTimestamp)
  })

  if (minDate === Infinity) {
    // Handle case where no valid dates were found
    return { datasets: [] }
  }

  // 2. Generate all dates in the range and fill gaps
  const filledData: Point[] = []
  let currentDate = dayjs(minDate)
  const endDate = dayjs(maxDate)

  while (
    currentDate.isBefore(endDate) ||
    currentDate.isSame(endDate, props.timeUnit)
  ) {
    const currentTimestamp = currentDate.startOf(props.timeUnit).valueOf()
    const yValue = existingDataMap.get(currentTimestamp) ?? 0 // Use 0 if data point is missing
    filledData.push({ x: currentTimestamp, y: yValue })
    currentDate = currentDate.add(1, props.timeUnit) // Increment by the specified unit
  }

  // Sorting might still be needed if the original data wasn't perfectly ordered by the timeUnit start
  filledData.sort((a, b) => a.x - b.x)

  return {
    datasets: [
      {
        label: props.chartTitle,
        backgroundColor: "#3b82f6", // Example blue color
        borderColor: "#3b82f6",
        tension: 0.2,
        data: filledData, // Use the filled and sorted data
        spanGaps: false, // Explicitly disable spanning gaps in Chart.js
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
            week: "MMM YYYY",
            month: "MMM YYYY",
            year: "YYYY",
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
