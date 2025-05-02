<script setup lang="ts">
import { ref, watch, computed } from "vue"

const props = defineProps<{ modelValue: string | undefined }>()
const emit = defineEmits(["update:modelValue"])

const hoursRef = ref<HTMLInputElement | null>(null)
const minutesRef = ref<HTMLInputElement | null>(null)

const hoursValue = ref("")
const minutesValue = ref("")

// Combine segments into HH:mm format, padding with zeros
const formattedTime = computed(() => {
  const hh = String(hoursValue.value).padStart(2, "0")
  const mm = String(minutesValue.value).padStart(2, "0")
  // Only return full format if both parts seem plausible (e.g., have some value)
  // Let blur handle final validation/emission for partial inputs
  if (hoursValue.value !== "" && minutesValue.value !== "") {
    // Basic validation before considering it potentially complete
    const hNum = parseInt(hh, 10)
    const mNum = parseInt(mm, 10)
    if (
      !isNaN(hNum) &&
      hNum >= 0 &&
      hNum <= 23 &&
      !isNaN(mNum) &&
      mNum >= 0 &&
      mNum <= 59
    ) {
      return `${hh}:${mm}`
    }
  }
  // Return undefined or some indicator if not complete/valid yet during typing
  return undefined
})

// Parse incoming modelValue (e.g., "09:30") into segments
const parseModelValue = (value: string | undefined) => {
  if (value && /^\d{1,2}:\d{1,2}$/.test(value)) {
    const [h, m] = value.split(":")
    hoursValue.value = h || ""
    minutesValue.value = m || ""
  } else {
    hoursValue.value = ""
    minutesValue.value = ""
  }
}

// Watch for external changes
watch(
  () => props.modelValue,
  (newValue) => {
    // Avoid infinite loops if change came from internal update
    if (newValue !== formattedTime.value) {
      parseModelValue(newValue)
    }
  },
  { immediate: true }
)

const focusNext = (current: "hours" | "minutes") => {
  if (current === "hours") {
    minutesRef.value?.focus()
    minutesRef.value?.select()
  }
}

const handleHoursInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  let val = input.value.replace(/\D/g, "") // Remove non-digits

  if (val.length > 2) {
    val = val.slice(0, 2)
  }

  // Basic range check (00-23)
  const numVal = parseInt(val, 10)
  if (!isNaN(numVal) && numVal > 23) {
    val = "23"
  }

  hoursValue.value = val
  input.value = val // Ensure display matches state

  if (val.length === 2) {
    focusNext("hours")
  }
}

const handleMinutesInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  let val = input.value.replace(/\D/g, "") // Remove non-digits

  if (val.length > 2) {
    val = val.slice(0, 2)
  }

  // Basic range check (00-59)
  const numVal = parseInt(val, 10)
  if (!isNaN(numVal) && numVal > 59) {
    val = "59"
  }

  minutesValue.value = val
  input.value = val // Ensure display matches state
}

// Final validation and emit on blur
const handleBlur = (_segment: "hours" | "minutes") => {
  // Small delay to allow focus to shift between inputs without prematurely finalizing
  setTimeout(() => {
    // Check if focus is still within the component (on the other input)
    const activeEl = document.activeElement
    if (activeEl !== hoursRef.value && activeEl !== minutesRef.value) {
      // Focus left the component, finalize and emit
      const finalHours = String(hoursValue.value).padStart(2, "0")
      const finalMinutes = String(minutesValue.value).padStart(2, "0")
      const finalValue = `${finalHours}:${finalMinutes}`

      // Validate final format and range
      const hNum = parseInt(finalHours, 10)
      const mNum = parseInt(finalMinutes, 10)

      if (
        /^\d{2}:\d{2}$/.test(finalValue) &&
        !isNaN(hNum) &&
        hNum >= 0 &&
        hNum <= 23 &&
        !isNaN(mNum) &&
        mNum >= 0 &&
        mNum <= 59
      ) {
        // Update internal state to padded value
        hoursValue.value = finalHours
        minutesValue.value = finalMinutes
        // Emit the final valid value if it changed
        if (props.modelValue !== finalValue) {
          emit("update:modelValue", finalValue)
        }
      } else {
        // If invalid on blur, potentially clear or emit undefined
        if (props.modelValue !== undefined) {
          // Avoid emitting if already undefined
          emit("update:modelValue", undefined)
        }
        // Optionally clear internal state too if invalid
        // hoursValue.value = '';
        // minutesValue.value = '';
      }
    }
  }, 0)
}

const handleSegmentClick = (event: MouseEvent) => {
  const input = event.target as HTMLInputElement
  // Use timeout to ensure selection happens after click logic settles
  setTimeout(() => {
    input.select()
  }, 0)
}
</script>

<template>
  <div
    class="relative inline-flex items-center border border-neutral-300 dark:border-neutral-700 rounded-md shadow-sm overflow-hidden focus-within:ring-1 focus-within:ring-primary-500 dark:focus-within:ring-primary-400 focus-within:border-primary-500 dark:focus-within:border-primary-400"
  >
    <input
      ref="hoursRef"
      v-model="hoursValue"
      type="text"
      placeholder="HH"
      maxlength="2"
      class="w-10 text-center bg-transparent outline-none px-1 py-1.5 text-sm"
      @input="handleHoursInput"
      @blur="handleBlur('hours')"
      @click="handleSegmentClick"
    />
    <span>:</span>
    <input
      ref="minutesRef"
      v-model="minutesValue"
      type="text"
      placeholder="mm"
      maxlength="2"
      class="w-10 text-center bg-transparent outline-none p-1 text-sm"
      @input="handleMinutesInput"
      @blur="handleBlur('minutes')"
      @click="handleSegmentClick"
    />
  </div>
</template>
