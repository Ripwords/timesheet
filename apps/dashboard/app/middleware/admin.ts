export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  // Fetch user profile to check role
  const checkAuthStatus = async () => {
    const eden = useEden()
    try {
      const { data } = await eden.api.auth.profile.get()
      return data
    } catch /* istanbul ignore next -- ignore error */ {
      // It's okay if this fails (e.g., 401), means user is not logged in
      // console.error("Admin middleware auth check failed:", error)
      return null
    }
  }

  const user = await checkAuthStatus()
  const isAdmin = user?.role === "admin"

  // Define admin routes that this middleware protects
  // You might want to make this more robust, e.g., matching patterns like /admin/*
  const adminRoutes = ["/admin"]
  const requiresAdmin = adminRoutes.some((route) => to.path.startsWith(route))

  // If the route requires admin privileges and the user is not an admin
  if (requiresAdmin && !isAdmin) {
    console.log(
      `Admin middleware: Non-admin user attempting to access ${to.path}. Redirecting.`
    )
    // Redirect non-admins away. Redirect to login if not authenticated,
    // or to the base route if authenticated but not admin.
    if (!user) {
      return navigateTo("/auth/login")
    } else {
      return navigateTo("/")
    }
  }

  console.log(`Admin middleware: Allowing navigation to ${to.path}`)
  // Allow navigation if the user is an admin or the route doesn't require admin
})
