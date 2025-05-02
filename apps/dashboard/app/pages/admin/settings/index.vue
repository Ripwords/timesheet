<script lang="ts" setup>
import type { ColumnDef, CellContext } from "@tanstack/vue-table"
import { z } from "zod"
import type { FormSubmitEvent } from "#ui/types"
import { UButton, UBadge, USelectMenu, UInput } from "#components"

definePageMeta({
  middleware: "admin",
})

useSeoMeta({
  title: "Admin Settings",
  description: "Manage application settings like departments and descriptions.",
})

// Inject $eden
const { $eden } = useNuxtApp()
const toast = useToast()

// --- Types --- //
// Use the type derived from toast for consistency
type AllowedColor = NonNullable<Parameters<typeof toast.add>["0"]["color"]>

interface Department {
  id: string
  name: string
  color: AllowedColor
  maxSessionMinutes: number
  defaultDescriptions?: string[]
}

// Define allowed Nuxt UI colors matching the *database schema* (No 'gray')
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
} = await useAsyncData("admin-departments", async () => {
  const { data, error } = await $eden.api.admin.departments.index.get({
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

// --- Form --- //
const deptSchema = z.object({
  name: z.string().min(1, "Name is required"),
  color: z.enum(allowedColors, {
    errorMap: () => ({ message: "Invalid color selected" }),
  }),
  maxSessionMinutes: z.number().int().min(1, "Must be 1 or greater"),
  defaultDescriptions: z.optional(
    z
      .array(z.string().min(1, "Description cannot be empty"))
      .min(0)
      .refine((items) => new Set(items).size === items.length, {
        message: "Descriptions must be unique",
      })
  ),
})

type DeptSchema = z.output<typeof deptSchema>

const newDeptData = reactive<Partial<DeptSchema>>({
  name: "",
  color: "primary",
  maxSessionMinutes: 0,
  defaultDescriptions: [],
})

const editDeptData = reactive<Partial<DeptSchema>>({
  name: "",
  color: "primary",
  maxSessionMinutes: 0,
  defaultDescriptions: [],
})

// --- Modal Control --- //
function openAddDeptModal() {
  newDeptData.name = ""
  newDeptData.color = "primary"
  newDeptData.maxSessionMinutes = 0
  newDeptData.defaultDescriptions = []
  isAddDeptModalOpen.value = true
}

async function openEditDeptModal(dept: Department) {
  selectedDepartment.value = dept
  isLoadingEditData.value = true
  isEditDeptModalOpen.value = true
  editDescriptionInput.value = ""

  try {
    const { data: fetchedDept, error } = await $eden.api.admin
      .departments({ id: dept.id })
      .get()

    if (error) {
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
    } else {
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
const editDescriptionInput = ref("")

function addDescription(target: "new" | "edit") {
  const inputRef = target === "new" ? newDescriptionInput : editDescriptionInput
  const dataRef = target === "new" ? newDeptData : editDeptData
  const description = inputRef.value.trim()

  if (description && !dataRef.defaultDescriptions?.includes(description)) {
    dataRef.defaultDescriptions = [
      ...(dataRef.defaultDescriptions || []),
      description,
    ]
    inputRef.value = ""
  }
}

function removeDescription(index: number, target: "new" | "edit") {
  const dataRef = target === "new" ? newDeptData : editDeptData
  if (dataRef.defaultDescriptions) {
    dataRef.defaultDescriptions.splice(index, 1)
  }
}

// --- API Actions --- //
async function handleAddDepartment(event: FormSubmitEvent<DeptSchema>) {
  isSaving.value = true
  try {
    const payload = {
      name: event.data.name,
      color: event.data.color,
      maxSessionMinutes: event.data.maxSessionMinutes,
      defaultDescriptions: event.data.defaultDescriptions ?? [],
    }
    const { error } = await $eden.api.admin.departments.index.post(payload)

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
  }
  isSaving.value = false
}

async function handleUpdateDepartment(event: FormSubmitEvent<DeptSchema>) {
  if (!selectedDepartment.value?.id) return
  isSaving.value = true
  const deptId = selectedDepartment.value.id
  const payload = {
    name: event.data.name,
    color: event.data.color,
    maxSessionMinutes: event.data.maxSessionMinutes,
    defaultDescriptions: event.data.defaultDescriptions ?? [],
  }
  // Log the payload being sent to the backend
  // console.log("Updating department payload:", payload) // Removed debugging log
  const { error } = await $eden.api.admin
    .departments({ id: deptId })
    .put(payload)

  if (error) {
    toast.add({
      title: "Error",
      description: String(error.value) || "Failed to update department.",
      color: "error",
    })
  } else {
    toast.add({
      title: "Success",
      description: "Department updated.",
      color: "success",
    })
  }

  isEditDeptModalOpen.value = false
  selectedDepartment.value = null
  editDescriptionInput.value = ""
  await refreshDepartments()
  isSaving.value = false
}

async function handleDeleteDepartment() {
  if (!selectedDepartment.value?.id) return
  isDeleting.value = true
  const deptId = selectedDepartment.value.id
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

  isDeleteDeptModalOpen.value = false
  selectedDepartment.value = null
  isDeleting.value = false
  await refreshDepartments()
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
</script>

<template>
  <div class="space-y-6">
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
            :schema="deptSchema"
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
                    @keydown.enter.prevent="addDescription('new')"
                  />
                  <UButton
                    icon="i-heroicons-plus"
                    size="sm"
                    variant="outline"
                    aria-label="Add Description"
                    :disabled="isSaving || !newDescriptionInput.trim()"
                    @click="addDescription('new')"
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
                      @click="removeDescription(index, 'new')"
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
      <template #content>
        <UCard v-if="selectedDepartment">
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
            :schema="deptSchema"
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

            <UFormField
              label="Default Descriptions"
              name="defaultDescriptions"
            >
              <div class="space-y-2">
                <p class="text-xs text-gray-500 dark:text-gray-400 pb-1">
                  Editing will replace all existing descriptions for this
                  department.
                </p>
                <div class="flex gap-2">
                  <UInput
                    v-model="editDescriptionInput"
                    placeholder="Add a description..."
                    class="flex-grow"
                    :disabled="isSaving"
                    @keydown.enter.prevent="addDescription('edit')"
                  />
                  <UButton
                    icon="i-heroicons-plus"
                    size="sm"
                    variant="outline"
                    aria-label="Add Description"
                    :disabled="
                      isSaving ||
                      isLoadingEditData ||
                      !editDescriptionInput.trim()
                    "
                    @click="addDescription('edit')"
                  />
                </div>
                <ul
                  v-if="editDeptData.defaultDescriptions?.length"
                  class="divide-y divide-gray-200 dark:divide-gray-700"
                >
                  <li
                    v-for="(desc, index) in editDeptData.defaultDescriptions"
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
                      :disabled="isSaving || isLoadingEditData"
                      @click="removeDescription(index, 'edit')"
                    />
                  </li>
                </ul>
                <p
                  v-else
                  class="text-xs text-gray-500 dark:text-gray-400"
                >
                  No default descriptions found or added yet.
                </p>
              </div>
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
              <UButton
                label="Cancel"
                variant="ghost"
                :disabled="isSaving || isLoadingEditData"
                @click="isEditDeptModalOpen = false"
              />
              <UButton
                type="submit"
                label="Save Changes"
                :loading="isSaving"
                :disabled="isLoadingEditData"
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
      <template #content>
        <UCard v-if="selectedDepartment">
          <template #header>Confirm Deletion</template>
          <p>
            Are you sure you want to delete the department
            <strong>"{{ selectedDepartment.name }}"</strong>?
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
