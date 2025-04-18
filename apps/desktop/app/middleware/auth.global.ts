export default defineNuxtRouteMiddleware(async (to) => {
  const checkAuthStatus = async () => {
    const eden = useEden()
    const { data } = await eden.api.auth.profile.get()

    return data
  }
  const isAuthenticated = await checkAuthStatus()

  // --- Route Definitions ---
  // Define routes that require authentication
  const protectedRoutes = ["/"] // Add your protected routes like '/dashboard', '/settings'
  const requiresAuth = protectedRoutes.includes(to.path)

  // Define authentication routes (e.g., login, register pages)
  const authRoutes = ["/login"] // Add your auth routes like '/register'
  const isAuthRoute = authRoutes.includes(to.path)

  // --- Redirection Logic ---

  // 1. If navigating to a protected route and not authenticated, redirect to login
  if (requiresAuth && !isAuthenticated) {
    // Avoid redirect loop if login page is somehow protected
    if (to.path !== "/login") {
      console.log(`Redirecting to login from protected route: ${to.path}`)
      return navigateTo("/login") // Redirect to your login page
    }
  }

  // 2. "Auto-login" redirection: If authenticated and trying to access an auth route (like login)
  if (isAuthenticated && isAuthRoute) {
    const defaultAuthenticatedRoute = "/" // Your main authenticated page (e.g., dashboard)
    // Avoid redirecting to the same page if default route is somehow the auth route
    if (to.path !== defaultAuthenticatedRoute) {
      console.log(
        `User authenticated, redirecting from auth route ${to.path} to ${defaultAuthenticatedRoute}`
      )
      return navigateTo(defaultAuthenticatedRoute)
    }
  }

  // 3. Allow navigation if none of the above conditions trigger a redirect
  console.log(`Allowing navigation to: ${to.path}`)
  // No return statement means navigation proceeds
})
