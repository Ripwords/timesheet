<script setup lang="ts">
const state = reactive({
  email: "",
  password: "",
})

const eden = useEden()
const toast = useToast()

async function submit() {
  const { data, error } = await eden.api.auth.signin.post({
    email: state.email,
    password: state.password,
  })

  if (error) {
    toast.add({
      title: "Error",
      color: "error",
      description: String(error.value),
    })
  }

  if (data) {
    toast.add({
      title: "Success",
      color: "success",
      description: "Logged in successfully",
    })
    navigateTo("/")
  }
}
</script>

<template>
  <div class="flex items-center justify-center">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-xl font-bold text-center">Login</h1>
      </template>

      <UForm
        :state
        @submit="submit"
      >
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
          class="mb-6"
        >
          <UInput
            v-model="state.password"
            type="password"
          />
        </UFormField>

        <UButton
          type="submit"
          block
          label="Login"
        />
      </UForm>

      <template #footer>
        <p class="text-sm text-center">
          Don't have an account?
          <NuxtLink
            to="/auth/register"
            class="text-primary"
            >Register</NuxtLink
          >
        </p>
        <p class="text-sm text-center cursor-pointer">
          <NuxtLink
            to="/auth/forgot-password"
            class="text-primary"
            >Forgot password?</NuxtLink
          >
        </p>
      </template>
    </UCard>
  </div>
</template>
