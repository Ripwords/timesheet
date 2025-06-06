<script setup lang="ts">
useSeoMeta({
  title: "Timesheet | Register",
  description: "Register for an account",
})

const { $eden } = useNuxtApp()
const toast = useToast()
const disabled = ref(false)

const { data: departments } = await useLazyAsyncData(
  "departments",
  async () => {
    const { data } = await $eden.api.departments.get()
    return data ?? []
  }
)

const state = reactive({
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  departmentId: departments.value?.[0]?.id,
})

async function submit() {
  disabled.value = true

  try {
    if (state.password !== state.confirmPassword) {
      toast.add({
        title: "Error",
        description: "Passwords do not match",
      })
      return
    }

    if (!state.departmentId) {
      toast.add({
        title: "Error",
        description: "Please select a department",
      })
      return
    }

    const { data, error } = await $eden.api.auth.signup.post({
      email: state.email,
      password: state.password,
      departmentId: state.departmentId,
    })

    if (error) {
      toast.add({
        title: "Error",
        description: String(error.value) || "Failed to register",
      })
    }

    if (data) {
      toast.add({
        title: "Success",
        description: "Registered successfully, please verify your email",
      })
      navigateTo("/auth/login")
    }
  } catch (error: unknown) {
    console.error("Failed to submit registration:", error)
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
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Department"
          name="department"
          class="mb-4"
        >
          <USelectMenu
            v-model="state.departmentId"
            class="w-full"
            :items="departments"
            label-key="departmentName"
            value-key="id"
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
            class="w-full"
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
            class="w-full"
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
            class="w-full"
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
  </div>
</template>
