<script setup lang="ts">
// Use defineModel for the project name input
const projectName = defineModel<string>("modelValue", { required: true })
// Keep other props as they are
defineProps({
  title: {
    type: String,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  submitLabel: {
    type: String,
    default: "Submit",
  },
})

const state = reactive({
  projectName: projectName.value,
})

// Only define emits for submit and cancel now
const emit = defineEmits(["submit", "cancel"])
</script>

<template>
  <UForm :state>
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold">{{ title }}</h3>
      </template>

      <UFormField
        label="Project Name"
        name="projectName"
        required
        class="mb-4"
      >
        <UInput
          v-model="projectName"
          class="w-full"
          placeholder="Enter project name"
        />
      </UFormField>

      <template #footer>
        <div class="flex justify-end space-x-3">
          <UButton
            label="Cancel"
            variant="ghost"
            :disabled="loading"
            @click="emit('cancel')"
          />
          <UButton
            type="submit"
            :label="submitLabel"
            icon="i-heroicons-check-circle"
            :loading="loading"
            @click="emit('submit')"
          />
        </div>
      </template>
    </UCard>
  </UForm>
</template>
