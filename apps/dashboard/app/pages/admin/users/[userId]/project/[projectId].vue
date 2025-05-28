<script lang="ts" setup>
import type { TableColumn } from "@nuxt/ui"
import duration from "dayjs/plugin/duration"
import isSameOrAfter from "dayjs/plugin/isSameOrAfter"
import isSameOrBefore from "dayjs/plugin/isSameOrBefore"

definePageMeta({
  middleware: "admin",
})

useSeoMeta({
  title: "Timesheet | Admin User Project",
  description: "Admin user project for managing the application",
})

const { params } = useRoute("admin-users-userId-project-projectId")
const projectId = params.projectId
const userId = params.userId
const activeAccordion = ref("")

const { $eden } = useNuxtApp()
const dayjs = useDayjs()
const { monthOptions, selectedMonth } = useDropdownMonths()

dayjs.extend(duration)
dayjs.extend(isSameOrAfter)
dayjs.extend(isSameOrBefore)

const { data: user } = await useLazyAsyncData(`user-${userId}`, async () => {
  const { data } = await $eden.api.admin.users
    .user({
      id: userId,
    })
    .get()
  return data
})

const { data: userTimeEntries } = await useLazyAsyncData(
  `user-time-entries-${projectId}`,
  async () => {
    const { data } = await $eden.api["time-entries"]
      .project({
        id: projectId,
      })
      .get({
        query: {
          userId,
          startDate: dayjs(selectedMonth.value).startOf("month").toISOString(),
          endDate: dayjs(selectedMonth.value).endOf("month").toISOString(),
        },
      })

    return data ?? []
  },
  {
    watch: [selectedMonth],
  }
)

// --- Table Columns ---
interface TimeEntryRow {
  id: string
  date: string
  description: string
  duration: string
}

const columns: TableColumn<TimeEntryRow>[] = [
  { accessorKey: "date", header: "Date" },
  { accessorKey: "description", header: "Description" },
  { accessorKey: "duration", header: "Duration" },
]

// --- Computed Properties ---

// Calculate week ranges for the selected month
const weekRanges = computed(() => {
  const monthStart = dayjs(selectedMonth.value).startOf("month")
  const monthEnd = dayjs(selectedMonth.value).endOf("month")
  const ranges = []
  let currentWeekStart = monthStart

  for (let i = 0; i < 5; i++) {
    // Max 5 weeks displayed
    let currentWeekEnd = currentWeekStart.add(6, "days").endOf("day")
    // Ensure week end doesn't exceed month end for the last week calculation
    if (currentWeekEnd.isAfter(monthEnd)) {
      currentWeekEnd = monthEnd
    }

    // Only add week if it starts within the month
    if (
      currentWeekStart.isBefore(monthEnd) ||
      currentWeekStart.isSame(monthEnd, "day")
    ) {
      ranges.push({
        weekNumber: i + 1,
        start: currentWeekStart.toISOString(),
        end: currentWeekEnd.toISOString(),
        displayRange: `${currentWeekStart.format(
          "MMM D"
        )} - ${currentWeekEnd.format("MMM D")}`,
      })
    }

    // Move to the next week's start
    currentWeekStart = currentWeekStart.add(7, "days").startOf("day")
    // Stop if the next week starts after the month ends
    if (currentWeekStart.isAfter(monthEnd)) {
      break
    }
  }
  return ranges
})

// Group entries, calculate totals, and format for Accordion
const accordionItems = computed(() => {
  return weekRanges.value.map((week) => {
    const weekStart = dayjs(week.start)
    const weekEnd = dayjs(week.end)

    const entriesInWeek =
      userTimeEntries.value?.filter((entry) => {
        const entryDate = dayjs(entry.date)
        return (
          entryDate.isSameOrAfter(weekStart, "day") &&
          entryDate.isSameOrBefore(weekEnd, "day")
        )
      }) ?? []

    const formattedEntries = entriesInWeek
      .map((timeEntry) => {
        if (!timeEntry) return null

        const duration = dayjs.duration(timeEntry.durationSeconds, "seconds")
        const hours = Math.floor(duration.asHours())
        const minutes = duration.minutes()
        const seconds = duration.seconds()

        return {
          id: timeEntry.id,
          date: dayjs(timeEntry.date).format("YYYY-MM-DD"),
          description: timeEntry.description || "-",
          duration: `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
        }
      })
      .filter(Boolean) as TimeEntryRow[]

    const totalSeconds = formattedEntries.reduce((total, entry) => {
      const originalEntry = entriesInWeek.find((e) => e.id === entry.id)
      return total + (originalEntry?.durationSeconds || 0)
    }, 0)

    const formattedDuration =
      totalSeconds > 0
        ? `${Math.floor(
            dayjs.duration(totalSeconds, "seconds").asHours()
          )}h ${dayjs.duration(totalSeconds, "seconds").minutes()}m`
        : "0h 0m"

    return {
      label: `Week ${week.weekNumber} (${week.displayRange}) - Total: ${formattedDuration}`,
      slot: `week-${week.weekNumber}`,
      disabled: totalSeconds === 0,
      weekData: {
        entries: formattedEntries,
        totalDurationSeconds: totalSeconds,
        formattedTotalDuration: formattedDuration,
      },
    }
  })
})

// Overall total calculations
const overallTotalSeconds = computed(() => {
  return accordionItems.value.reduce(
    (sum, item) => sum + item.weekData.totalDurationSeconds,
    0
  )
})

const formattedOverallTotalDuration = computed(() => {
  if (overallTotalSeconds.value === 0) return "0h 0m"
  const duration = dayjs.duration(overallTotalSeconds.value, "seconds")
  const hours = Math.floor(duration.asHours())
  const minutes = duration.minutes()
  return `${hours}h ${minutes}m`
})

// --- Fetch Project Name ---
const { data: project } = await useLazyAsyncData(
  `project-${projectId}`,
  async () => {
    const { data } = await $eden.api.projects.id({ id: projectId }).get()
    return data
  }
)

watch(selectedMonth, () => {
  activeAccordion.value = ""
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center mb-2">
        <h2 class="text-xl font-semibold">
          {{ user?.email || "Loading User..." }}
        </h2>
        <div>
          <label class="mr-2 text-sm font-medium">Month:</label>
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
      <div v-if="user || project">
        <div v-if="user">
          <Department :department-id="user.departmentId" />
        </div>
        <div
          v-if="project"
          class="font-medium mt-1"
        >
          Project: {{ project?.name || "Loading Project..." }}
        </div>
      </div>
    </template>

    <div v-if="userTimeEntries">
      <UAccordion
        v-model="activeAccordion"
        :items="accordionItems"
      >
        <template
          v-for="item in accordionItems"
          :key="item.slot"
          #[item.slot]="{ item: accordionItem }"
        >
          <UCard class="my-5">
            <template #header>
              <div class="flex justify-between items-center">
                <h3 class="text-lg font-medium">
                  {{ accordionItem.label }}
                </h3>
              </div>
            </template>
            <UTable
              :data="accordionItem.weekData.entries"
              :columns
              :empty-state="{
                icon: 'i-heroicons-clock',
                label: 'No time entries found for this week.',
              }"
            />
            <template #footer>
              <div class="mt-2 text-right text-sm font-semibold">
                Weekly Total:
                {{ accordionItem.weekData.formattedTotalDuration }}
              </div>
            </template>
          </UCard>
        </template>
      </UAccordion>

      <div class="mt-6 pt-4 border-t text-right font-bold text-lg">
        Overall Monthly Total: {{ formattedOverallTotalDuration }}
      </div>
    </div>
    <div
      v-else
      class="text-center p-4"
    >
      Loading time entries...
    </div>
  </UCard>
</template>
