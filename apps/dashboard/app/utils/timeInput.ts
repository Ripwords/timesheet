export const parseDurationFromTimeInput = (
  timeStr: string | undefined
): number | null => {
  if (!timeStr) return null

  const parts = timeStr.split(":")
  if (parts.length !== 2) return null

  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  if (isNaN(hours) || isNaN(minutes)) return null

  return hours * 3600 + minutes * 60
}

export const formatDuration = (totalSeconds: number): string => {
  const dayjs = useDayjs()
  if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0)
    return "00:00"
  const d = dayjs.duration(totalSeconds, "seconds")
  // Note: dayjs duration format doesn't directly handle total hours > 24 well for HH:mm.
  // We calculate total hours manually.
  const totalHours = Math.floor(d.asHours())
  const minutes = d.minutes()

  const hoursStr = String(totalHours).padStart(2, "0")
  const minutesStr =
    typeof minutes === "number" && !isNaN(minutes)
      ? String(minutes).padStart(2, "0")
      : "00"

  return `${hoursStr}:${minutesStr}`
}

export interface TimeEntry {
  id: string
  projectId: string
  projectName?: string // Added for display
  date: string // Date in YYYY-MM-DD format
  durationSeconds: number
  dateFormatted?: string
  durationFormatted?: string
  description?: string
}
