<script lang="ts" setup>
import type { CellContext, ColumnDef } from "@tanstack/vue-table"
import { UBadge, UButton, UIcon, UInput } from "#components"
import type { FormSubmitEvent } from "#ui/types"

definePageMeta({
  middleware: "admin",
})

useSeoMeta({
  title: "Timesheet | Admin Settings",
  description: "Manage application settings like departments and descriptions.",
})

// Inject $eden
const { $eden } = useNuxtApp()
const toast = useToast()

// --- Types --- //
// Use the type derived from toast for consistency
type AllowedColor = NonNullable<Parameters<typeof toast.add>["0"]["color"]>

// Interface for a description object with ID
interface DescriptionItem {
  id: string // UUID from the database
  description: string
}

// Interface for Department including typed descriptions
interface Department {
  id: string
  name: string
  color: AllowedColor
  maxSessionMinutes: number
  defaultDescriptions?: DescriptionItem[]
}

const allowedColors = [
  "primary",
  "secondary",
  "info",
  "success",
  "warning",
  "error",
  "neutral",
] as const

const {
  data: departments,
  pending,
  refresh: refreshDepartments,
} = await useLazyAsyncData("admin-settings-departments", async () => {
  const { data, error } = await $eden.api.admin.departments.get({
    query: {},
  })
  if (error) {
    console.error("API Error fetching departments:", error.value)
    throw new Error(
      String(error.value) || "Failed to fetch departments from API"
    )
  }
  return data.map((d) => ({
    id: d.id,
    name: d.name,
    color: d.color as AllowedColor,
    maxSessionMinutes: d.maxSessionMinutes ?? 0,
  }))
})

// --- State --- //
const isAddDeptModalOpen = ref(false)
const isEditDeptModalOpen = ref(false)
const isDeleteDeptModalOpen = ref(false)
const selectedDepartment = ref<Department | null>(null)
const isSaving = ref(false)
const isDeleting = ref(false)
const isLoadingEditData = ref(false)

// State to hold the original descriptions fetched for comparison
const originalDescriptions = ref<DescriptionItem[]>([])

const newDeptData = reactive({
  name: "",
  color: "primary" as AllowedColor,
  maxSessionMinutes: 0,
  defaultDescriptions: [] as string[], // For adding, keep as string array
})

// State for the 'Edit Department' modal (uses DescriptionItem)
const editDeptData = reactive({
  name: "",
  color: "primary" as AllowedColor,
  maxSessionMinutes: 0,
  defaultDescriptions: [] as DescriptionItem[], // Use DescriptionItem array
})

// --- Helper function to sort descriptions consistently by ID ---
function sortDescriptionsById(
  descriptions: DescriptionItem[]
): DescriptionItem[] {
  // Create a copy before sorting to avoid mutating the original refs
  return [...descriptions].sort((a, b) => {
    // Handle 'new-' IDs consistently if needed, though simple string sort might suffice
    return a.id.localeCompare(b.id)
  })
}

// --- Computed property to detect changes in descriptions ---
const hasDescriptionChanges = computed(() => {
  if (isLoadingEditData.value) {
    return false // Don't show changes while loading
  }
  const sortedOriginal = sortDescriptionsById(originalDescriptions.value)
  const sortedCurrent = sortDescriptionsById(editDeptData.defaultDescriptions)

  // Compare JSON strings of sorted arrays
  return JSON.stringify(sortedOriginal) !== JSON.stringify(sortedCurrent)
})

// --- Modal Control --- //
function openAddDeptModal() {
  newDeptData.name = ""
  newDeptData.color = "primary"
  newDeptData.maxSessionMinutes = 0
  newDeptData.defaultDescriptions = []
  newDescriptionInput.value = ""
  isAddDeptModalOpen.value = true
}

async function openEditDeptModal(dept: Department) {
  selectedDepartment.value = dept
  isLoadingEditData.value = true
  isEditDeptModalOpen.value = true
  editDescriptionInput.value = ""
  originalDescriptions.value = []

  try {
    // Fetch including description IDs
    const { data: fetchedDept, error } = await $eden.api.admin
      .departments({ id: dept.id })
      .get()

    if (error) {
      toast.add({
        title: "Error",
        description: "Failed to fetch department details for editing",
        color: "error",
      })
      console.error("API Error fetching department details:", error.value)
      throw new Error(
        String(error.value) || "Failed to fetch department details for editing"
      )
    }

    if (fetchedDept) {
      editDeptData.name = fetchedDept.name
      editDeptData.color = fetchedDept.color as AllowedColor
      editDeptData.maxSessionMinutes = fetchedDept.maxSessionMinutes ?? 0
      editDeptData.defaultDescriptions = fetchedDept.defaultDescriptions ?? []
      originalDescriptions.value = JSON.parse(
        JSON.stringify(editDeptData.defaultDescriptions)
      )
    } else {
      toast.add({
        title: "Error",
        description: `Department with ID ${dept.id} not found.`,
        color: "error",
      })
      throw new Error(`Department with ID ${dept.id} not found.`)
    }
  } catch (error: unknown) {
    console.error("Failed to load department for editing:", error)
    const message =
      error instanceof Error ? error.message : "Could not load department data."
    toast.add({ title: "Error", description: message, color: "error" })
    isEditDeptModalOpen.value = false
    selectedDepartment.value = null
  }

  isLoadingEditData.value = false
}

function openDeleteDeptModal(dept: Department) {
  selectedDepartment.value = dept
  isDeleteDeptModalOpen.value = true
}

// --- Helper functions for Description List --- //
const newDescriptionInput = ref("")
const editDescriptionInput = ref("") // Input for adding NEW items in edit mode
// State to track which item is currently being edited inline
const editingDescriptionId = ref<string | null>(null)
const editingDescriptionText = ref("")

// Add a *new* description string to the 'Add' modal list
function addDescriptionForNewDept() {
  const description = newDescriptionInput.value.trim()
  if (description && !newDeptData.defaultDescriptions.includes(description)) {
    newDeptData.defaultDescriptions.push(description)
    newDescriptionInput.value = ""
  }
}

// Remove a description string from the 'Add' modal list by index
function removeDescriptionForNewDept(index: number) {
  newDeptData.defaultDescriptions.splice(index, 1)
}

// Add a *new* description item to the 'Edit' modal list
function addDescriptionForEditDept() {
  const descriptionText = editDescriptionInput.value.trim()
  if (descriptionText) {
    // Check if text already exists (ignoring items marked for deletion implicitly)
    const alreadyExists = editDeptData.defaultDescriptions.some(
      (item) => item.description === descriptionText
    )
    if (!alreadyExists) {
      const newItem: DescriptionItem = {
        id: `new-${Date.now()}-${useId()}`, // Temporary ID
        description: descriptionText,
      }
      // Create a new array with the new item added
      editDeptData.defaultDescriptions = [
        ...editDeptData.defaultDescriptions,
        newItem,
      ]
      editDescriptionInput.value = ""
    } else {
      toast.add({
        title: "Duplicate",
        description: "Description text already exists.",
        color: "warning",
      })
    }
  }
}

// Remove a description item from the 'Edit' modal list by its ID
function removeDescriptionForEditDept(id: string) {
  const index = editDeptData.defaultDescriptions.findIndex((d) => d.id === id)
  if (index !== -1) {
    // Create a new array excluding the item to be removed
    const updatedDescriptions = editDeptData.defaultDescriptions.filter(
      (d) => d.id !== id
    )
    editDeptData.defaultDescriptions = updatedDescriptions // Assign the new array

    if (editingDescriptionId.value === id) {
      cancelInlineEdit() // Cancel edit if the removed item was being edited
    }
  }
}

// Start inline editing for an existing description item
function startInlineEdit(item: DescriptionItem) {
  editingDescriptionId.value = item.id
  editingDescriptionText.value = item.description
}

// Cancel inline editing
function cancelInlineEdit() {
  editingDescriptionId.value = null
  editingDescriptionText.value = ""
}

// Save the inline edit
function saveInlineEdit() {
  if (!editingDescriptionId.value) return
  const index = editDeptData.defaultDescriptions.findIndex(
    (d) => d.id === editingDescriptionId.value
  )
  if (index !== -1) {
    const newText = editingDescriptionText.value.trim()
    const currentItem = editDeptData.defaultDescriptions[index]! // Add non-null assertion

    if (
      newText &&
      currentItem.description !== newText // Use currentItem
    ) {
      // Check for duplicates before saving
      const isDuplicate = editDeptData.defaultDescriptions.some(
        (item, idx) => idx !== index && item.description === newText
      )
      if (!isDuplicate) {
        // Create a new array with the updated item
        const updatedDescriptions = [...editDeptData.defaultDescriptions]
        updatedDescriptions[index] = { ...currentItem, description: newText } // Create new object for the item
        editDeptData.defaultDescriptions = updatedDescriptions // Assign the new array
      } else {
        toast.add({
          title: "Duplicate",
          description: "Description text already exists.",
          color: "warning",
        })
        return // Don't cancel edit on duplicate error
      }
    }
  }
  cancelInlineEdit() // Close editor after save (or if text is empty/unchanged)
}

// --- Table Columns Definition for Descriptions --- //
const descriptionTableColumns: ColumnDef<DescriptionItem>[] = [
  {
    accessorKey: "description",
    header: "Description Text",
    cell: (context: CellContext<DescriptionItem, unknown>) => {
      const item = context.row.original
      // Use Vue's h function for rendering conditionally
      if (editingDescriptionId.value === item.id) {
        // Render input and buttons when editing this item
        return h(
          "div",
          { class: "flex items-center space-x-1 py-1" }, // Add py-1 for consistency
          [
            h(UInput, {
              modelValue: editingDescriptionText.value, // Use modelValue for v-model via h
              "onUpdate:modelValue": (value: string | number) =>
                (editingDescriptionText.value = String(value)),
              class: "flex-grow text-sm",
              size: "sm",
              autofocus: true, // Autofocus when input appears
              disabled: isSaving.value,
              onKeydown: (event: KeyboardEvent) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  saveInlineEdit()
                } else if (event.key === "Escape") {
                  event.preventDefault()
                  cancelInlineEdit()
                }
              },
            }),
            h(UButton, {
              icon: "i-heroicons-check-20-solid",
              size: "xs",
              color: "success", // Corrected color name
              variant: "ghost",
              disabled: isSaving.value,
              onClick: () => saveInlineEdit(),
              ariaLabel: "Save Edit",
            }),
            h(UButton, {
              icon: "i-heroicons-x-mark-20-solid",
              size: "xs",
              color: "error", // Corrected color name
              variant: "ghost",
              disabled: isSaving.value,
              onClick: () => cancelInlineEdit(),
              ariaLabel: "Cancel Edit",
            }),
          ]
        )
      } else {
        // Render span when not editing (no click handler needed here)
        return h(
          "span",
          {
            class: "text-sm flex-grow py-1", // Add py-1
          },
          item.description
        )
      }
    },
  },
  {
    accessorKey: "actions",
    header: "Actions",
    cell: (context: CellContext<DescriptionItem, unknown>) => {
      return h("div", { class: "flex items-center space-x-2" }, [
        h(UButton, {
          icon: "i-heroicons-pencil-square",
          size: "sm", // Changed size from xl to sm
          color: "warning",
          variant: "outline",
          ariaLabel: "Edit Description", // More specific label
          // Ensure this item is not already being edited by someone else (or itself)
          disabled:
            editingDescriptionId.value !== null &&
            editingDescriptionId.value !== context.row.original.id,
          onClick: () => startInlineEdit(context.row.original), // This triggers the state change
        }),
        h(UButton, {
          icon: "i-heroicons-trash",
          size: "sm", // Changed size from xl to sm
          color: "error",
          variant: "outline",
          ariaLabel: "Delete Description", // More specific label
          // Disable delete while any item is being edited
          disabled: editingDescriptionId.value !== null,
          onClick: () => removeDescriptionForEditDept(context.row.original.id),
        }),
      ])
    },
  },
]

// --- API Actions --- //
// Type for handleAddDepartment submit event can be inferred or use typeof newDeptData
async function handleAddDepartment(event: FormSubmitEvent<typeof newDeptData>) {
  isSaving.value = true
  try {
    // Payload uses the simple string array from newDeptData
    const payload = {
      name: event.data.name,
      color: event.data.color,
      maxSessionMinutes: event.data.maxSessionMinutes,
      defaultDescriptions: event.data.defaultDescriptions ?? [],
    }
    // POST endpoint expects simple string array
    const { error } = await $eden.api.admin.departments.post(payload)

    if (error) {
      console.error("API Error adding department:", error.value)
      throw new Error(String(error.value) || "Failed to add department via API")
    }

    toast.add({
      title: "Success",
      description: "Department added.",
      color: "success",
    })
    isAddDeptModalOpen.value = false
    newDescriptionInput.value = ""
    await refreshDepartments()
  } catch (error: unknown) {
    console.error("Failed to add department:", error)
    const message =
      error instanceof Error ? error.message : "Could not add department."
    toast.add({ title: "Error", description: message, color: "error" })
  } finally {
    isSaving.value = false
  }
}

// No longer uses FormSubmitEvent directly due to complex state
async function handleUpdateDepartment() {
  if (!selectedDepartment.value?.id) {
    console.error("handleUpdateDepartment called with no selected department.")
    toast.add({
      title: "Error",
      description: "No department selected for update.",
      color: "error",
    })
    isSaving.value = false // Ensure saving state is reset
    return
  }

  isSaving.value = true
  const deptId = selectedDepartment.value.id

  // --- Diffing Logic --- Find changes between original and current descriptions
  const originalMap = new Map(
    originalDescriptions.value.map((d) => [d.id, d.description])
  )
  const currentMap = new Map(
    editDeptData.defaultDescriptions.map((d) => [d.id, d.description])
  )

  const descriptionsToAdd: string[] = []
  const descriptionsToUpdate: { id: string; description: string }[] = []
  const descriptionIdsToDelete: string[] = []

  // Check current items
  currentMap.forEach((description, id) => {
    if (id.startsWith("new-")) {
      // Identify new items by temporary ID prefix
      descriptionsToAdd.push(description)
    } else if (originalMap.has(id)) {
      // Existed before, check if changed
      if (originalMap.get(id) !== description) {
        descriptionsToUpdate.push({ id, description })
      }
    } else {
      // This case should ideally not happen if temp IDs are used correctly
      console.warn(
        `[${deptId}] Found current item with non-new ID not in original map:`,
        id
      )
    }
  })

  // Check original items to see which were deleted
  originalMap.forEach((description, id) => {
    if (!currentMap.has(id)) {
      descriptionIdsToDelete.push(id)
    }
  })
  // --- End Diffing Logic ---

  // Construct the payload for the PUT request
  const updatePayload: {
    name?: string
    color?: AllowedColor
    maxSessionMinutes?: number
    descriptionsToAdd?: string[]
    descriptionsToUpdate?: { id: string; description: string }[]
    descriptionIdsToDelete?: string[]
  } = {}

  // Add core fields only if they changed
  if (editDeptData.name !== selectedDepartment.value.name) {
    updatePayload.name = editDeptData.name
  }
  if (editDeptData.color !== selectedDepartment.value.color) {
    updatePayload.color = editDeptData.color
  }
  if (
    editDeptData.maxSessionMinutes !==
    selectedDepartment.value.maxSessionMinutes
  ) {
    updatePayload.maxSessionMinutes = editDeptData.maxSessionMinutes
  }

  // Add description changes if any exist
  if (descriptionsToAdd.length > 0)
    updatePayload.descriptionsToAdd = descriptionsToAdd
  if (descriptionsToUpdate.length > 0)
    updatePayload.descriptionsToUpdate = descriptionsToUpdate
  if (descriptionIdsToDelete.length > 0)
    updatePayload.descriptionIdsToDelete = descriptionIdsToDelete

  // Only send request if there's something to update
  if (Object.keys(updatePayload).length === 0) {
    toast.add({
      title: "No Changes",
      description: "No changes detected to save.",
      color: "info",
    })
    isSaving.value = false
    isEditDeptModalOpen.value = false // Close modal if no changes
    return
  }

  console.log("Updating department granular payload:", updatePayload)

  try {
    const { error } = await $eden.api.admin
      .departments({ id: deptId })
      .put(updatePayload) // Send the granular payload

    if (error) {
      console.error("API Error updating department:", error.value)
      throw new Error(
        String(error.value) || "Failed to update department via API"
      )
    }

    toast.add({
      title: "Success",
      description: "Department updated.",
      color: "success",
    })
    isEditDeptModalOpen.value = false
    selectedDepartment.value = null
    editDescriptionInput.value = ""
    originalDescriptions.value = [] // Clear original descriptions
    cancelInlineEdit() // Ensure edit state is reset
    await refreshDepartments() // Refresh list view
  } catch (error: unknown) {
    console.error("Failed to update department:", error)
    const message =
      error instanceof Error ? error.message : "Could not update department."
    toast.add({ title: "Error", description: message, color: "error" })
  } finally {
    isSaving.value = false
  }
}

async function handleDeleteDepartment() {
  if (!selectedDepartment.value?.id) return
  isDeleting.value = true
  const deptId = selectedDepartment.value.id

  try {
    const { error } = await $eden.api.admin.departments({ id: deptId }).delete()

    if (error) {
      toast.add({
        title: "Error",
        description: String(error.value) || "Failed to delete department.",
        color: "error",
      })
    } else {
      toast.add({
        title: "Success",
        description: "Department deleted.",
        color: "success",
      })
    }

    await refreshDepartments()
  } catch (error: unknown) {
    console.error("Failed to delete department:", error)
    const message =
      error instanceof Error ? error.message : "Could not delete department."
    toast.add({ title: "Error", description: message, color: "error" })
  } finally {
    isDeleteDeptModalOpen.value = false
    selectedDepartment.value = null
    isDeleting.value = false
  }
}

// --- Table Columns --- //
const departmentColumns: ColumnDef<Department, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "color",
    header: "Color",
    cell: (context: CellContext<Department, unknown>) => {
      const color = context.getValue() as AllowedColor
      // Display color name and a visual indicator (e.g., a badge)
      return h(UBadge, {
        label: color,
        color: color,
        variant: "subtle", // Or another suitable variant
      })
    },
  },
  {
    accessorKey: "maxSessionMinutes",
    header: "Max Session (mins)",
  },
  {
    accessorKey: "actions",
    header: "Actions",
    cell: (context: CellContext<Department, unknown>) => {
      const dept = context.row.original
      return h("div", { class: "flex items-center space-x-2" }, [
        h(UButton, {
          icon: "i-heroicons-pencil-square",
          size: "xl",
          color: "warning",
          variant: "outline",
          ariaLabel: "Edit",
          onClick: () => openEditDeptModal(dept),
        }),
        h(UButton, {
          icon: "i-heroicons-trash",
          size: "xl",
          color: "error",
          variant: "outline",
          ariaLabel: "Delete",
          onClick: () => openDeleteDeptModal(dept),
        }),
      ])
    },
  },
]

// --- Timer Notification Settings State --- //
const timerReminderTime = ref<string>("18:00")
const enableTimerReminders = ref<boolean>(false)
const isLoadingTimerSettings = ref(true)
const isSavingTimerSettings = ref(false)

// Generate 5-minute interval time options ("00:00" to "23:55")
const timerTimeOptions = Array.from({ length: 24 * 12 }, (_, i) => {
  const hours = Math.floor(i / 12)
  const minutes = (i % 12) * 5
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`
})

async function fetchTimerSettings() {
  isLoadingTimerSettings.value = true
  try {
    const { data, error } = await $eden.api.admin.settings.get()
    if (error) throw error.value
    timerReminderTime.value = data.timerReminderTime || "18:00"
    enableTimerReminders.value = !!data.enableTimerReminders
  } catch {
    toast.add({
      title: "Error",
      description: "Failed to load timer notification settings",
      color: "error",
    })
  } finally {
    isLoadingTimerSettings.value = false
  }
}

async function saveTimerSettings() {
  isSavingTimerSettings.value = true
  try {
    const { error } = await $eden.api.admin.settings.patch({
      timerReminderTime: timerReminderTime.value,
      enableTimerReminders: enableTimerReminders.value,
    })
    if (error) throw error.value
    toast.add({
      title: "Success",
      description: "Timer notification settings saved",
      color: "success",
    })
  } catch {
    toast.add({
      title: "Error",
      description: "Failed to save timer notification settings",
      color: "error",
    })
  } finally {
    isSavingTimerSettings.value = false
  }
}

onMounted(fetchTimerSettings)
</script>

<template>
  <div class="space-y-6">
    <!-- Timer Notification Settings Section -->
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Timer Notification Settings</h2>
      </template>
      <div
        v-if="isLoadingTimerSettings"
        class="flex items-center gap-2 py-4"
      >
        <UIcon
          name="i-heroicons-arrow-path-20-solid"
          class="animate-spin text-xl"
        />
        <span>Loading settings...</span>
      </div>
      <div
        v-else
        class="space-y-4"
      >
        <UFormField
          label="Timer Reminder Time"
          name="timerReminderTime"
        >
          <USelectMenu
            v-model="timerReminderTime"
            :items="timerTimeOptions"
            :disabled="isSavingTimerSettings"
            placeholder="Select time"
            searchable
          >
            <template #default>
              <span v-if="timerReminderTime">{{ timerReminderTime }}</span>
              <span
                v-else
                class="text-gray-500 dark:text-gray-400"
                >Select time</span
              >
            </template>
          </USelectMenu>
        </UFormField>
        <UFormField
          label="Enable Timer Reminders"
          name="enableTimerReminders"
        >
          <USwitch
            v-model="enableTimerReminders"
            :disabled="isSavingTimerSettings"
          />
        </UFormField>
        <div class="flex justify-end">
          <UButton
            :loading="isSavingTimerSettings"
            label="Save Settings"
            @click="saveTimerSettings"
          />
        </div>
      </div>
    </UCard>
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <h2 class="text-lg font-semibold">Manage Departments</h2>
          <UButton
            icon="i-heroicons-plus-circle"
            size="sm"
            variant="solid"
            label="Add Department"
            @click="openAddDeptModal"
          />
        </div>
      </template>

      <UTable
        :data="departments"
        :columns="departmentColumns"
        :loading="pending"
        :empty-state="{
          icon: 'i-heroicons-building-office-2-20-solid',
          label: 'No departments found.',
        }"
      />
    </UCard>

    <!-- Department Modals -->
    <UModal
      v-model:open="isAddDeptModalOpen"
      :prevent-close="isSaving"
    >
      <template #content>
        <UCard>
          <template #header>Add Department</template>
          <UForm
            :state="newDeptData"
            class="space-y-4"
            @submit="handleAddDepartment"
          >
            <UFormField
              label="Name"
              name="name"
              required
            >
              <UInput
                v-model="newDeptData.name"
                :disabled="isSaving"
              />
            </UFormField>
            <UFormField
              label="Max Session (mins)"
              name="maxSessionMinutes"
              required
            >
              <UInput
                v-model="newDeptData.maxSessionMinutes"
                type="number"
                :disabled="isSaving"
              />
            </UFormField>
            <UFormField
              label="Color"
              name="color"
              required
            >
              <USelectMenu
                v-model="newDeptData.color"
                :items="[...allowedColors]"
                :disabled="isSaving"
                placeholder="Select color"
              >
                <template #default>
                  <UBadge
                    v-if="newDeptData.color"
                    :color="newDeptData.color"
                    variant="subtle"
                    class="text-xs"
                    >{{ newDeptData.color }}</UBadge
                  >
                  <span
                    v-else
                    class="text-gray-500 dark:text-gray-400"
                    >Select color</span
                  >
                </template>
                <template #item="{ item: color }">
                  <UBadge
                    :color="color"
                    variant="subtle"
                    class="text-xs"
                    >{{ color }}</UBadge
                  >
                </template>
              </USelectMenu>
            </UFormField>

            <UFormField
              label="Default Descriptions"
              name="defaultDescriptions"
            >
              <div class="space-y-2">
                <div class="flex gap-2">
                  <UInput
                    v-model="newDescriptionInput"
                    placeholder="Add a description..."
                    class="flex-grow"
                    :disabled="isSaving"
                    @keydown.enter.prevent="addDescriptionForNewDept()"
                  />
                  <UButton
                    icon="i-heroicons-plus"
                    size="sm"
                    variant="outline"
                    aria-label="Add Description"
                    :disabled="isSaving || !newDescriptionInput.trim()"
                    @click="addDescriptionForNewDept()"
                  />
                </div>
                <ul
                  v-if="newDeptData.defaultDescriptions?.length"
                  class="divide-y divide-gray-200 dark:divide-gray-700"
                >
                  <li
                    v-for="(desc, index) in newDeptData.defaultDescriptions"
                    :key="index"
                    class="py-2 flex justify-between items-center"
                  >
                    <span class="text-sm">{{ desc }}</span>
                    <UButton
                      icon="i-heroicons-x-mark-20-solid"
                      size="xs"
                      color="error"
                      variant="ghost"
                      aria-label="Remove Description"
                      :disabled="isSaving"
                      @click="removeDescriptionForNewDept(index)"
                    />
                  </li>
                </ul>
                <p
                  v-else
                  class="text-xs text-gray-500 dark:text-gray-400"
                >
                  No default descriptions added yet.
                </p>
              </div>
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
              <UButton
                label="Cancel"
                variant="ghost"
                :disabled="isSaving"
                @click="isAddDeptModalOpen = false"
              />
              <UButton
                type="submit"
                label="Save"
                :loading="isSaving"
              />
            </div>
          </UForm>
        </UCard>
      </template>
    </UModal>

    <UModal
      v-model:open="isEditDeptModalOpen"
      :prevent-close="isSaving || isLoadingEditData"
    >
      <template
        v-if="selectedDepartment"
        #content
      >
        <UCard>
          <template #header>Edit Department</template>

          <div
            v-if="isLoadingEditData"
            class="flex items-center justify-center h-40"
          >
            <UIcon
              name="i-heroicons-arrow-path-20-solid"
              class="animate-spin text-xl"
            />
            <span class="ml-2">Loading details...</span>
          </div>

          <UForm
            v-else
            :state="editDeptData"
            class="space-y-4"
            @submit="handleUpdateDepartment"
          >
            <UFormField
              label="Name"
              name="name"
              required
            >
              <UInput
                v-model="editDeptData.name"
                :disabled="isSaving"
              />
            </UFormField>
            <UFormField
              label="Max Session (mins)"
              name="maxSessionMinutes"
              required
            >
              <UInput
                v-model="editDeptData.maxSessionMinutes"
                type="number"
                :disabled="isSaving"
              />
            </UFormField>
            <UFormField
              label="Color"
              name="color"
              required
            >
              <USelectMenu
                v-model="editDeptData.color"
                :items="[...allowedColors]"
                :disabled="isSaving"
                placeholder="Select color"
              >
                <template #default>
                  <UBadge
                    v-if="editDeptData.color"
                    :color="editDeptData.color"
                    variant="subtle"
                    class="text-xs"
                    >{{ editDeptData.color }}</UBadge
                  >
                  <span
                    v-else
                    class="text-gray-500 dark:text-gray-400"
                    >Select color</span
                  >
                </template>
                <template #item="{ item: color }">
                  <UBadge
                    :color="color"
                    variant="subtle"
                    class="text-xs"
                    >{{ color }}</UBadge
                  >
                </template>
              </USelectMenu>
            </UFormField>

            <UFormField name="defaultDescriptions">
              <!-- Use the label slot to add the indicator -->
              <template #label>
                Default Descriptions
                <UBadge
                  v-if="hasDescriptionChanges"
                  color="warning"
                  variant="soft"
                  size="xs"
                  class="ml-1 align-middle"
                >
                  Unsaved Changes
                </UBadge>
              </template>

              <div class="space-y-2">
                <div class="flex gap-2">
                  <UInput
                    v-model="editDescriptionInput"
                    placeholder="Add a new description..."
                    class="flex-grow"
                    :disabled="isSaving || editingDescriptionId !== null"
                    @keydown.enter.prevent="addDescriptionForEditDept()"
                  />
                  <UButton
                    icon="i-heroicons-plus"
                    size="sm"
                    variant="outline"
                    aria-label="Add New Description"
                    :disabled="
                      isSaving ||
                      !editDescriptionInput.trim() ||
                      editingDescriptionId !== null
                    "
                    @click="addDescriptionForEditDept()"
                  />
                </div>
                <UTable
                  :data="editDeptData.defaultDescriptions"
                  :columns="descriptionTableColumns"
                  :empty-state="{
                    icon: 'i-heroicons-circle-stack-20-solid',
                    label: 'No default descriptions.',
                  }"
                  class="max-h-75 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700"
                >
                </UTable>
              </div>
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
              <UButton
                label="Cancel"
                variant="ghost"
                :disabled="isSaving || isLoadingEditData"
                @click="
                  () => {
                    isEditDeptModalOpen = false
                    cancelInlineEdit()
                  }
                "
              />
              <UButton
                type="submit"
                label="Save Changes"
                :loading="isSaving"
                :disabled="isLoadingEditData || editingDescriptionId !== null"
              />
            </div>
          </UForm>
        </UCard>
      </template>
    </UModal>

    <UModal
      v-model:open="isDeleteDeptModalOpen"
      :prevent-close="isDeleting"
    >
      <template
        v-if="selectedDepartment"
        #content
      >
        <UCard>
          <template #header>Confirm Deletion</template>
          <p>
            Are you sure you want to delete the department
            <strong>"{{ selectedDepartment?.name }}"</strong>?
          </p>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                label="Cancel"
                variant="ghost"
                :disabled="isDeleting"
                @click="isDeleteDeptModalOpen = false"
              />
              <UButton
                label="Delete"
                color="error"
                :loading="isDeleting"
                @click="handleDeleteDepartment"
              />
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
