<script setup lang="ts">
const { params } = useRoute("auth-reset-password-token")
const token = params.token as string

const state = reactive({
  password: "",
  confirmPassword: "",
})

const { $eden } = useNuxtApp()
const toast = useToast()

async function submitPasswordReset() {
  if (!token) {
    toast.add({
      title: "Error",
      description: "Invalid or missing reset token.",
    })
    await navigateTo("/auth/login") // Redirect if no token
    return
  }

  if (state.password !== state.confirmPassword) {
    toast.add({
      title: "Error",
      description: "Passwords do not match.",
    })
    return
  }

  if (!state.password) {
    toast.add({
      title: "Error",
      description: "Password cannot be empty.",
    })
    return
  }

  const { data, error } = await $eden.api.auth["reset-password"].post({
    token,
    password: state.password,
  })

  if (error) {
    toast.add({
      title: "Error",
      description:
        typeof error.value === "object" && error.value?.message
          ? error.value.message
          : "Failed to reset password. The link may have expired.",
    })
  }

  if (data) {
    toast.add({
      title: "Success",
      description: "Password has been reset successfully.",
    })
    await navigateTo("/auth/login")
  }
}
</script>

<template>
  <div class="flex items-center justify-center">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-xl font-bold text-center">Reset Password</h1>
      </template>

      <UForm
        :state
        @submit="submitPasswordReset"
      >
        <UFormField
          label="New Password"
          name="password"
          class="mb-4"
        >
          <UInput
            v-model="state.password"
            type="password"
            required
          />
        </UFormField>

        <UFormField
          label="Confirm New Password"
          name="confirmPassword"
          class="mb-6"
        >
          <UInput
            v-model="state.confirmPassword"
            type="password"
            required
          />
        </UFormField>

        <UButton
          type="submit"
          block
          label="Reset Password"
        />
      </UForm>

      <template #footer>
        <p class="text-sm text-center">
          Remembered your password?
          <NuxtLink
            to="/auth/login"
            class="text-primary"
            >Login</NuxtLink
          >
        </p>
      </template>
    </UCard>
  </div>
</template>
