export default defineNuxtRouteMiddleware(async (to) => {
  const checkAuthStatus = async () => {
    const { $eden } = useNuxtApp()
    try {
      const { data } = await $eden.api.auth.profile.get()

      return data
    } catch (error) {
      console.error(error)
      return
    }
  }
  const user = await checkAuthStatus() // Renamed for clarity and role access
  const isAuthenticated = !!user // Check if user object exists
  const isAdmin = user?.role === "admin" // Re-introduce admin check

  // --- Route Definitions ---
  // Define routes that require authentication (excluding admin routes)
  const protectedRoutes = ["/", "/time-entries"] // Removed '/admin', assuming it will be protected by 'admin' middleware
  const requiresAuth = protectedRoutes.includes(to.path)

  // Define authentication routes (e.g., login, register pages)
  const isAuthRoute = to.path.startsWith("/auth")

  // --- Redirection Logic ---
  // 1. If navigating to a protected route and not authenticated, redirect to login
  if (requiresAuth && !isAuthenticated) {
    if (to.path !== "/auth/login") {
      return navigateTo("/auth/login") // Redirect to your login page
    }
  }

  // 2. "Auto-login" redirection: If authenticated and trying to access an auth route (like login)
  if (isAuthenticated && isAuthRoute) {
    // If user is admin and tries to access auth page, redirect to /admin
    // Otherwise redirect regular authenticated users to /
    const targetRedirectRoute = isAdmin ? "/admin" : "/"

    // Avoid redirecting to the same page
    if (to.path !== targetRedirectRoute) {
      return navigateTo(targetRedirectRoute)
    }
  }

  // 3. Redirect admin from / to /admin
  if (isAuthenticated && isAdmin && to.path === "/") {
    return navigateTo("/admin")
  }

  // 4. Allow navigation if none of the above conditions trigger a redirect
  // Admin route access control will be handled by a separate middleware
  // No return statement means navigation proceeds
})
