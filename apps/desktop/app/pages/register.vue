<script setup lang="ts">
import { reactive } from "vue"

const state = reactive({
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
})

const eden = useEden()
const toast = useToast()

async function submit() {
  if (state.password !== state.confirmPassword) {
    toast.add({
      title: "Error",
      description: "Passwords do not match",
    })
    return
  }
  const { data, error } = await eden.auth.signup.post({
    email: state.email,
    password: state.password,
  })

  if (error) {
    toast.add({
      title: "Error",
      description: "Failed to register",
    })
  }

  if (data) {
    toast.add({
      title: "Success",
      description: "Registered successfully",
    })
    navigateTo("/login")
  }
}
</script>

<template>
  <UContainer class="flex items-center justify-center min-h-screen">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-xl font-bold text-center">Register</h1>
      </template>

      <UForm
        :state="state"
        @submit="submit"
      >
        <UFormField
          label="Name"
          name="name"
          class="mb-4"
        >
          <UInput
            v-model="state.name"
            placeholder="Your Name"
          />
        </UFormField>

        <UFormField
          label="Email"
          name="email"
          class="mb-4"
        >
          <UInput
            v-model="state.email"
            type="email"
            placeholder="s20@studio20.my"
          />
        </UFormField>

        <UFormField
          label="Password"
          name="password"
          class="mb-4"
        >
          <UInput
            v-model="state.password"
            type="password"
          />
        </UFormField>

        <UFormField
          label="Confirm Password"
          name="confirmPassword"
          class="mb-6"
        >
          <UInput
            v-model="state.confirmPassword"
            type="password"
          />
        </UFormField>

        <UButton
          type="submit"
          block
          label="Register"
        />
      </UForm>

      <template #footer>
        <p class="text-sm text-center">
          Already have an account?
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
