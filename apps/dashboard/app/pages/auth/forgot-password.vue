<script setup lang="ts">
const state = reactive({
  email: "",
})

const eden = useEden()
const toast = useToast()
const disabled = ref(false)

async function submitForgotPassword() {
  disabled.value = true
  if (!state.email) {
    toast.add({
      title: "Error",
      description: "Please enter an email",
    })
    return
  }

  const { data, error } = await eden.auth["forgot-password"].post({
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
  disabled.value = false
}
</script>

<template>
  <UContainer class="flex items-center justify-center min-h-screen">
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
            to="/login"
            class="text-primary"
            >Login</NuxtLink
          >
        </p>
      </template>
    </UCard>
  </UContainer>
</template>
