<script setup lang="ts">
import { departmentEnum } from "@timesheet/server/src/db/schema"
definePageMeta({
  layout: "auth",
})
const departments = departmentEnum.enumValues

const state = reactive({
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  department: departments[0],
})

const eden = useEden()
const toast = useToast()
const disabled = ref(false)

async function submit() {
  disabled.value = true
  if (state.password !== state.confirmPassword) {
    toast.add({
      title: "Error",
      description: "Passwords do not match",
    })
    return
  }
  const { data, error } = await eden.api.auth.signup.post({
    email: state.email,
    password: state.password,
    department: state.department,
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
      description: "Registered successfully, please verify your email",
    })
    navigateTo("/auth/login")
  }
  disabled.value = false
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
          label="Department"
          name="department"
          class="mb-4"
        >
          <USelectMenu
            v-model="state.department"
            :items="departments"
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
            placeholder="example@email.com"
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
          :disabled
        />
      </UForm>

      <template #footer>
        <p class="text-sm text-center">
          Already have an account?
          <NuxtLink
            to="/auth/login"
            class="text-primary"
            >Login</NuxtLink
          >
        </p>
      </template>
    </UCard>
  </UContainer>
</template>
