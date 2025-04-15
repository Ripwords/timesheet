<script setup lang="ts">
const state = reactive({
  email: "",
  password: "",
})

const eden = useEden()
const toast = useToast()

async function submit() {
  const { data, error } = await eden.auth.signin.post({
    email: state.email,
    password: state.password,
  })

  console.log(data)

  const { data: profile } = await eden.auth.profile.get()
  console.log(profile)

  if (error) {
    toast.add({
      title: "Error",
      description: "Invalid email or password",
    })
  }

  if (data) {
    toast.add({
      title: "Success",
      description: "Logged in successfully",
    })
    navigateTo("/")
  }
}
</script>

<template>
  <UContainer class="flex items-center justify-center min-h-screen">
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
            to="/register"
            class="text-primary"
            >Register</NuxtLink
          >
        </p>
        <p class="text-sm text-center cursor-pointer">
          <NuxtLink
            to="/forgot-password"
            class="text-primary"
            >Forgot password?</NuxtLink
          >
        </p>
      </template>
    </UCard>
  </UContainer>
</template>
