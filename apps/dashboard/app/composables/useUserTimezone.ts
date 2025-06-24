// Composable to handle user timezone detection and management
export const useUserTimezone = () => {
  const userTimezone = ref<string>("")

  // Detect user's timezone on client-side
  const detectTimezone = () => {
    if (import.meta.client) {
      try {
        userTimezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone
      } catch (error) {
        console.warn(
          "Failed to detect timezone, falling back to server timezone:",
          error
        )
        userTimezone.value = ""
      }
    }
  }

  // Get timezone headers for API requests
  const getTimezoneHeaders = () => {
    return userTimezone.value ? { "x-user-timezone": userTimezone.value } : {}
  }

  // Initialize timezone detection
  onMounted(() => {
    detectTimezone()
  })

  return {
    userTimezone: readonly(userTimezone),
    detectTimezone,
    getTimezoneHeaders,
  }
}
