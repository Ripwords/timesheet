<script lang="ts" setup>
import type { ColumnDef, CellContext } from "@tanstack/vue-table"
import { z } from "zod"
import type { FormSubmitEvent } from "#ui/types"
import { useToast } from "#imports"
import { UButton } from "#components"
import { CalendarDate, getLocalTimeZone } from "@internationalized/date"

definePageMeta({
  middleware: "admin",
})

useSeoMeta({
  title: "Admin Project",
  description: "Admin project for managing the application",
})

const route = useRoute("admin-projects-projectId")
const { projectId } = route.params
const { $eden, $dayjs } = useNuxtApp()

const {
  data: projectDetails,
  status,
  refresh,
} = await useLazyAsyncData(
  projectId ? `project-financials-${projectId}` : "project-financials-invalid",
  async () => {
    if (!projectId) {
      console.error("Cannot fetch financials without a valid project ID")
      return null // Prevent API call if ID is invalid
    }
    try {
      const { data, error } = await $eden.api.admin
        .financials({
          projectId,
        })
        .get()

      if (error) {
        console.error("Error fetching project financials:", error.value)
        return null // Return null on API error
      }
      return data
    } catch (e) {
      console.error("Exception during financial data fetch:", e)
      return null
    }
  }
)

type BudgetInjection = {
  id: string
  date: Date
  description: string
  amount: number
}

// State for modals
const isAddInjectionModalOpen = ref(false)
const isEditInjectionModalOpen = ref(false)
const isDeleteConfirmationModalOpen = ref(false)
const selectedInjection = ref<BudgetInjection | null>(null)

// Form state and validation schema
const injectionSchema = z.object({
  date: z.union([z.string(), z.date()]),
  description: z.string().optional(),
  amount: z.number().positive({ message: "Amount must be positive" }),
})

// Helper type for form state to be explicit about Date object
type InjectionSchema = z.output<typeof injectionSchema>

const newInjectionData = reactive<Partial<InjectionSchema>>({
  date: new Date(),
  description: "",
  amount: undefined,
})
const editInjectionData = reactive<Partial<InjectionSchema>>({
  date: undefined,
  description: "",
  amount: undefined,
})

// Computed property for newInjectionData date binding
const newInjectionCalendarDate = computed({
  get() {
    const d = newInjectionData.date
    if (d instanceof Date) {
      return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
    }
    return undefined
  },
  set(value: CalendarDate | undefined) {
    if (value) {
      newInjectionData.date = value.toDate(getLocalTimeZone()) // Convert back to Date
    } else {
      newInjectionData.date = undefined
    }
  },
})

// Computed property for editInjectionData date binding
const editInjectionCalendarDate = computed({
  get() {
    const d = editInjectionData.date
    if (d instanceof Date) {
      return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
    }
    return undefined
  },
  set(value: CalendarDate | undefined) {
    if (value) {
      editInjectionData.date = value.toDate(getLocalTimeZone()) // Convert back to Date
    } else {
      editInjectionData.date = undefined
    }
  },
})

// Loading states
const isSaving = ref(false)
const isDeleting = ref(false)

// Add toast composable
const toast = useToast()

// Modal control functions
function openAddInjectionModal() {
  newInjectionData.date = new Date()
  newInjectionData.description = ""
  newInjectionData.amount = undefined
  isAddInjectionModalOpen.value = true
}

function openEditInjectionModal(injection: BudgetInjection) {
  selectedInjection.value = injection
  editInjectionData.date = new Date(injection.date)
  editInjectionData.description = injection.description
  editInjectionData.amount = injection.amount
  isEditInjectionModalOpen.value = true
}

function openDeleteConfirmationModal(injection: BudgetInjection) {
  selectedInjection.value = injection
  isDeleteConfirmationModalOpen.value = true
}

// API Action Handlers
async function handleAddInjection(event: FormSubmitEvent<InjectionSchema>) {
  if (!projectId || !(event.data.date instanceof Date)) return
  isSaving.value = true
  try {
    const { error } = await $eden.api.admin.financials["budget-injection"]
      .new({
        projectId,
      })
      .post({
        amount: event.data.amount,
        description: event.data.description,
        date: event.data.date,
      })
    if (error) {
      toast.add({
        title: "Error",
        description: String(error.value),
        color: "error",
      })
    } else {
      toast.add({
        title: "Success",
        description: "Budget injection added.",
        color: "success",
      })
      isAddInjectionModalOpen.value = false
      await refresh() // Refresh project details
    }
  } catch (error) {
    console.error("Failed to add injection:", error)
    toast.add({
      title: "Error",
      description: "Could not add injection.",
      color: "error",
    })
  }
  isSaving.value = false
}

async function handleUpdateInjection(event: FormSubmitEvent<InjectionSchema>) {
  if (!selectedInjection.value?.id || !(event.data.date instanceof Date)) return
  const injectionId = selectedInjection.value.id
  isSaving.value = true
  try {
    const { error } = await $eden.api.admin.financials["budget-injection"]({
      injectionId,
    }).put({
      amount: event.data.amount,
      description: event.data.description,
      date: event.data.date,
    })

    if (error) {
      toast.add({
        title: "Error",
        description: String(error.value),
        color: "error",
      })
    } else {
      toast.add({
        title: "Success",
        description: "Budget injection updated.",
        color: "success",
      })
      isEditInjectionModalOpen.value = false
      selectedInjection.value = null
    }
    await refresh()
  } catch (error) {
    console.error("Failed to update injection:", error)
    toast.add({
      title: "Error",
      description: "Could not update injection.",
      color: "error",
    })
  }
  isSaving.value = false
}

async function handleDeleteInjection() {
  if (!selectedInjection.value?.id) return
  const injectionId = selectedInjection.value.id
  isDeleting.value = true
  try {
    const { error } = await $eden.api.admin.financials["budget-injection"]({
      injectionId,
    }).delete()
    if (error) {
      toast.add({
        title: "Error",
        description: String(error.value),
        color: "error",
      })
    } else {
      toast.add({
        title: "Success",
        description: "Budget injection deleted.",
        color: "success",
      })
      isDeleteConfirmationModalOpen.value = false
      selectedInjection.value = null
      await refresh()
    }
  } catch (error) {
    console.error("Failed to delete injection:", error)
    toast.add({
      title: "Error",
      description: "Could not delete injection.",
      color: "error",
    })
  }
  isDeleting.value = false
}

// Define table columns using ColumnDef
const budgetColumns: ColumnDef<BudgetInjection, unknown>[] = [
  {
    accessorKey: "date",
    header: "Date",
    cell: (context: CellContext<BudgetInjection, unknown>) => {
      const date = context.getValue() as Date | string
      return h("span", {}, $dayjs(date).format("YYYY-MM-DD"))
    },
  },
  {
    accessorKey: "description",
    header: "Description",
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: (context: CellContext<BudgetInjection, unknown>) => {
      const amount = context.getValue() as number
      return h("span", { class: "font-mono" }, `$${amount.toFixed(2)}`)
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: (context: CellContext<BudgetInjection, unknown>) => {
      const injection = context.row.original
      return h("div", { class: "flex items-center space-x-2" }, [
        h(UButton, {
          icon: "i-heroicons-pencil-square",
          size: "xl",
          color: "warning",
          variant: "outline",
          ariaLabel: "Edit",
          onClick: () => openEditInjectionModal(injection),
        }),
        h(UButton, {
          icon: "i-heroicons-trash",
          size: "xl",
          color: "error",
          variant: "outline",
          ariaLabel: "Delete",
          onClick: () => openDeleteConfirmationModal(injection),
        }),
      ])
    },
  },
]

const budgetInjections = computed<BudgetInjection[]>(
  () => projectDetails.value?.budgetInjections ?? []
)
const costOverTime = computed(() => projectDetails.value?.costOverTime ?? [])

const totalBudget = computed(() => {
  return budgetInjections.value.reduce((sum: number, b) => sum + b.amount, 0)
})

const totalCost = computed(() => {
  return costOverTime.value.reduce((sum: number, e) => sum + e.cost, 0)
})

const currentProfit = computed(() => totalBudget.value - totalCost.value)

// Helper to format date for the button
function formatDateButton(date: Date | undefined | string) {
  return date ? $dayjs(date).format("YYYY-MM-DD") : "Select Date"
}
</script>

<template>
  <div>
    <UCard v-if="projectDetails">
      <template #header>
        <div
          class="flex flex-col md:flex-row md:items-center md:justify-between gap-2"
        >
          <div>
            <h2 class="text-xl font-bold">{{ projectDetails.projectName }}</h2>
            <div class="text-sm text-gray-500">Project Financial Overview</div>
          </div>
          <div class="flex flex-col md:flex-row gap-2 mt-2 md:mt-0">
            <div
              class="bg-blue-100 text-blue-800 rounded px-3 py-1 text-sm font-semibold"
            >
              Budget: ${{ totalBudget.toFixed(2) }}
            </div>
            <div
              class="bg-red-100 text-red-800 rounded px-3 py-1 text-sm font-semibold"
            >
              Cost: ${{ totalCost.toFixed(2) }}
            </div>
            <div
              :class="[
                'rounded px-3 py-1 text-sm font-semibold',
                currentProfit >= 0
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800',
              ]"
            >
              Profit: ${{ currentProfit.toFixed(2) }}
            </div>
          </div>
        </div>
      </template>
      <div class="my-8">
        <AdminChartsFinancial
          v-if="costOverTime.length > 0 || budgetInjections.length > 0"
          :cost-over-time="costOverTime"
          :budget-injections="budgetInjections"
          :project-name="projectDetails.projectName"
        />
        <div
          v-else
          class="text-center text-gray-500"
        >
          No financial data available to display chart.
        </div>
      </div>
      <div class="mt-6">
        <div class="flex justify-between items-center mb-2">
          <h3 class="font-semibold">Budget Injections</h3>
          <UButton
            icon="i-heroicons-plus-circle"
            size="sm"
            variant="solid"
            label="Add Injection"
            @click="openAddInjectionModal"
          />
        </div>

        <UTable
          :data="budgetInjections"
          :columns="budgetColumns"
          :loading="status === 'pending'"
          :empty-state="{
            icon: 'i-heroicons-circle-stack-20-solid',
            label: 'No budget injections recorded.',
          }"
          class="mt-4"
        >
          <template #date-data="{ row }">
            <span>{{ row.original.date }}</span>
          </template>
        </UTable>

        <!-- Modals -->
        <UModal
          v-model:open="isAddInjectionModalOpen"
          :prevent-close="isSaving"
        >
          <template #content>
            <UCard>
              <template #header>Add Budget Injection</template>
              <UForm
                class="space-y-4"
                :schema="injectionSchema"
                :state="newInjectionData"
                @submit="handleAddInjection"
              >
                <UFormField
                  label="Date"
                  name="date"
                  class="w-full"
                  required
                >
                  <UPopover
                    :content="{ side: 'bottom', align: 'start', sideOffset: 8 }"
                  >
                    <UButton
                      icon="i-heroicons-calendar-days-20-solid"
                      :label="formatDateButton(newInjectionData.date)"
                      :color="newInjectionData.date ? 'neutral' : 'error'"
                      :variant="'outline'"
                      :disabled="isSaving"
                      class="w-full"
                    />
                    <template #content>
                      <UCalendar
                        v-model="newInjectionCalendarDate"
                        class="p-2"
                      />
                    </template>
                  </UPopover>
                </UFormField>
                <UFormField
                  label="Description"
                  name="description"
                  class="w-full"
                >
                  <UInput
                    v-model="newInjectionData.description"
                    class="w-full"
                    :disabled="isSaving"
                  />
                </UFormField>
                <UFormField
                  label="Amount"
                  name="amount"
                  class="w-full"
                  required
                >
                  <UInput
                    v-model.number="newInjectionData.amount"
                    class="w-full"
                    type="number"
                    step="0.01"
                    :disabled="isSaving"
                  >
                    <template #leading>
                      <Icon
                        name="i-heroicons-currency-dollar"
                        class="w-4 h-4"
                      />
                    </template>
                  </UInput>
                </UFormField>

                <div class="flex justify-end gap-2 mt-4">
                  <UButton
                    label="Cancel"
                    variant="ghost"
                    :disabled="isSaving"
                    @click="isAddInjectionModalOpen = false"
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
          v-model:open="isEditInjectionModalOpen"
          :prevent-close="isSaving"
        >
          <template #content>
            <UCard v-if="selectedInjection">
              <template #header>Edit Budget Injection</template>
              <UForm
                class="space-y-4"
                :schema="injectionSchema"
                :state="editInjectionData"
                @submit="handleUpdateInjection"
              >
                <UFormField
                  label="Date"
                  name="date"
                  class="w-full"
                  required
                >
                  <UPopover
                    :content="{ side: 'bottom', align: 'start', sideOffset: 8 }"
                  >
                    <UButton
                      icon="i-heroicons-calendar-days-20-solid"
                      :label="formatDateButton(editInjectionData.date)"
                      :color="editInjectionData.date ? 'neutral' : 'error'"
                      :variant="'outline'"
                      :disabled="isSaving"
                      class="w-full"
                    />
                    <template #content>
                      <UCalendar
                        v-model="editInjectionCalendarDate"
                        class="p-2"
                      />
                    </template>
                  </UPopover>
                </UFormField>
                <UFormField
                  label="Description"
                  name="description"
                  class="w-full"
                >
                  <UInput
                    v-model="editInjectionData.description"
                    class="w-full"
                    :disabled="isSaving"
                  />
                </UFormField>
                <UFormField
                  label="Amount"
                  name="amount"
                  required
                >
                  <UInput
                    v-model.number="editInjectionData.amount"
                    type="number"
                    step="0.01"
                    :disabled="isSaving"
                  >
                    <template #leading>
                      <Icon
                        name="i-heroicons-currency-dollar"
                        class="w-4 h-4"
                      />
                    </template>
                  </UInput>
                </UFormField>

                <div class="flex justify-end gap-2 mt-4">
                  <UButton
                    label="Cancel"
                    variant="ghost"
                    :disabled="isSaving"
                    @click="isEditInjectionModalOpen = false"
                  />
                  <UButton
                    type="submit"
                    label="Save Changes"
                    :loading="isSaving"
                  />
                </div>
              </UForm>
            </UCard>
          </template>
        </UModal>

        <UModal
          v-model:open="isDeleteConfirmationModalOpen"
          :prevent-close="isDeleting"
        >
          <template #content>
            <UCard v-if="selectedInjection">
              <template #header>Confirm Deletion</template>
              <p>
                Are you sure you want to delete the injection "{{
                  selectedInjection.description
                }}" dated
                {{ $dayjs(selectedInjection.date).format("YYYY-MM-DD") }} for
                ${{ selectedInjection.amount.toFixed(2) }}?
              </p>
              <template #footer>
                <div class="flex justify-end gap-2">
                  <UButton
                    label="Cancel"
                    variant="ghost"
                    :disabled="isDeleting"
                    @click="isDeleteConfirmationModalOpen = false"
                  />
                  <UButton
                    label="Delete"
                    color="error"
                    :loading="isDeleting"
                    @click="handleDeleteInjection"
                  />
                </div>
              </template>
            </UCard>
          </template>
        </UModal>
      </div>
    </UCard>
  </div>
</template>
