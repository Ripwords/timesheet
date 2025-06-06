<script setup lang="ts">
useSeoMeta({
  title: "Timesheet | Forgot Password",
  description: "Forgot your password? Reset it here.",
})

const state = reactive({
  email: "",
})

const { $eden } = useNuxtApp()
const toast = useToast()
const disabled = ref(false)

async function submitForgotPassword() {
  disabled.value = true

  try {
    if (!state.email) {
      toast.add({
        title: "Error",
        description: "Please enter an email",
      })
      return
    }

    const { data, error } = await $eden.api.auth["forgot-password"].post({
      email: state.email,
    })

    if (error) {
      toast.add({
        title: "Error",
        description:
          typeof error.value === "object" && error.value?.message
            ? error.value.message
            : "Failed to send reset password email",
      })
    }

    if (data) {
      toast.add({
        title: "Success",
        description:
          "If an account exists with this email, a reset password link has been sent.",
      })
      // Optionally navigate the user away or clear the form
      state.email = ""
    }
  } catch (error: unknown) {
    console.error("Failed to submit forgot password:", error)
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred."
    toast.add({ title: "Error", description: message, color: "error" })
  } finally {
    disabled.value = false
  }
}
</script>

<template>
  <div class="flex items-center justify-center">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-xl font-bold text-center">Forgot Password</h1>
      </template>

      <UForm
        :state
        @submit="submitForgotPassword"
      >
        <UFormField
          label="Email"
          name="email"
          class="mb-4"
          help="Enter the email address associated with your account."
        >
          <UInput
            v-model="state.email"
            type="email"
            placeholder="example@email.com"
            required
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          block
          :disabled
          label="Send Reset Link"
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
