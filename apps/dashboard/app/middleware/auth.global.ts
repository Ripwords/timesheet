export default defineNuxtRouteMiddleware(async (to) => {
  const checkAuthStatus = async () => {
    const eden = useEden()
    try {
      const { data } = await eden.auth.profile.get()

      return data
    } catch (error) {
      console.error(error)
      return
    }
  }
  const isAuthenticated = await checkAuthStatus()
  const isAdmin = isAuthenticated?.role === "admin"

  // --- Route Definitions ---
  // Define routes that require authentication
  const protectedRoutes = ["/"] // Add your protected routes like '/dashboard', '/settings'
  const requiresAuth = protectedRoutes.includes(to.path)

  // Define authentication routes (e.g., login, register pages)
  const isAuthRoute = to.path.startsWith("/auth")

  // --- Redirection Logic ---
  // 1. If navigating to a protected route and not authenticated, redirect to login
  if (requiresAuth && !isAuthenticated) {
    // Avoid redirect loop if login page is somehow protected
    if (to.path !== "/auth/login") {
      console.log(`Redirecting to login from protected route: ${to.path}`)
      return navigateTo("/auth/login") // Redirect to your login page
    }
  }

  // 2. "Auto-login" redirection: If authenticated and trying to access an auth route (like login)
  if (isAuthenticated && isAuthRoute) {
    // Determine the target redirect route based on user role
    const targetRedirectRoute = isAdmin ? "/admin" : "/" // Default authenticated route

    // Avoid redirecting to the same page
    if (to.path !== targetRedirectRoute) {
      console.log(
        `User authenticated (${
          isAdmin ? "admin" : "user"
        }), redirecting from auth route ${to.path} to ${targetRedirectRoute}`
      )
      return navigateTo(targetRedirectRoute)
    }
  }

  // 3. Allow navigation if none of the above conditions trigger a redirect
  console.log(`Allowing navigation to: ${to.path}`)
  // No return statement means navigation proceeds
})
