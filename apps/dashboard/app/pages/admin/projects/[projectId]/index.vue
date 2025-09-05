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
  title: "Timesheet | Admin Project",
  description: "Admin project for managing the application",
})

const route = useRoute("admin-projects-projectId")
const { projectId } = route.params
const { $eden, $dayjs } = useNuxtApp()

const {
  data: projectDetails,
  status,
  refresh: refreshProjectDetails,
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

type RecurringBudgetInjection = {
  id: string
  projectId: string
  amount: string
  frequency: string
  startDate: string
  endDate: string | null
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// State for modals
const isAddInjectionModalOpen = ref(false)
const isEditInjectionModalOpen = ref(false)
const isDeleteConfirmationModalOpen = ref(false)
const selectedInjection = ref<BudgetInjection | null>(null)

// State for recurring budget modals
const isAddRecurringBudgetModalOpen = ref(false)
const isEditRecurringBudgetModalOpen = ref(false)
const isDeactivateRecurringBudgetModalOpen = ref(false)
const selectedRecurringBudget = ref<RecurringBudgetInjection | null>(null)

// Form state and validation schema
const injectionSchema = z.object({
  date: z.union([z.string(), z.date()]),
  description: z.string().optional(),
  amount: z.number().positive({ message: "Amount must be positive" }),
})

const recurringBudgetSchema = z.object({
  amount: z.number().positive({ message: "Amount must be positive" }),
  frequency: z.enum(["monthly", "quarterly", "yearly"] as const),
  startDate: z.string(),
  endDate: z.string().optional(),
  description: z.string().optional(),
})

// Helper type for form state to be explicit about Date object
type InjectionSchema = z.output<typeof injectionSchema>
type RecurringBudgetSchema = z.output<typeof recurringBudgetSchema>
type Frequency = "monthly" | "quarterly" | "yearly"

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

const newRecurringBudgetData = reactive<Partial<RecurringBudgetSchema>>({
  amount: undefined,
  frequency: "monthly" as Frequency,
  startDate: $dayjs().format("YYYY-MM-DD"),
  endDate: undefined,
  description: "",
})
const editRecurringBudgetData = reactive<Partial<RecurringBudgetSchema>>({
  amount: undefined,
  frequency: "monthly" as Frequency,
  startDate: "",
  endDate: undefined,
  description: "",
})

// Computed properties for USelectMenu binding
const newRecurringBudgetFrequency = computed({
  get() {
    const freq = newRecurringBudgetData.frequency
    return freq ? frequencyOptions.find((opt) => opt.value === freq) : undefined
  },
  set(value: (typeof frequencyOptions)[0] | undefined) {
    newRecurringBudgetData.frequency = value?.value as Frequency
  },
})

const editRecurringBudgetFrequency = computed({
  get() {
    const freq = editRecurringBudgetData.frequency
    return freq ? frequencyOptions.find((opt) => opt.value === freq) : undefined
  },
  set(value: (typeof frequencyOptions)[0] | undefined) {
    editRecurringBudgetData.frequency = value?.value as Frequency
  },
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
      await refreshProjectDetails() // Refresh project details
    }
  } catch (error) {
    console.error("Failed to add injection:", error)
    toast.add({
      title: "Error",
      description: "Could not add injection.",
      color: "error",
    })
  } finally {
    isSaving.value = false
  }
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
    await refreshProjectDetails()
  } catch (error) {
    console.error("Failed to update injection:", error)
    toast.add({
      title: "Error",
      description: "Could not update injection.",
      color: "error",
    })
  } finally {
    isSaving.value = false
  }
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
      await refreshProjectDetails()
    }
  } catch (error) {
    console.error("Failed to delete injection:", error)
    toast.add({
      title: "Error",
      description: "Could not delete injection.",
      color: "error",
    })
  } finally {
    isDeleting.value = false
  }
}

// Add recurring budget data fetching
const { data: recurringBudgetData, refresh: refreshRecurringBudget } =
  await useLazyAsyncData(
    projectId
      ? `project-recurring-budget-${projectId}`
      : "project-recurring-budget-invalid",
    async () => {
      if (!projectId) {
        console.error(
          "Cannot fetch recurring budget without a valid project ID"
        )
        return null
      }
      try {
        const { data, error } = await $eden.api.projects
          .id({
            id: projectId,
          })
          ["recurring-budget"].get()

        if (error) {
          console.error("Error fetching recurring budget:", error.value)
          return null
        }
        return data
      } catch (e) {
        console.error("Exception during recurring budget fetch:", e)
        return null
      }
    }
  )

// Modal control functions for recurring budget
function openAddRecurringBudgetModal() {
  newRecurringBudgetData.amount = undefined
  newRecurringBudgetData.frequency = "monthly"
  newRecurringBudgetData.startDate = $dayjs().format("YYYY-MM-DD")
  newRecurringBudgetData.endDate = undefined
  newRecurringBudgetData.description = ""
  isAddRecurringBudgetModalOpen.value = true
}

function openEditRecurringBudgetModal(
  recurringBudget: RecurringBudgetInjection
) {
  selectedRecurringBudget.value = recurringBudget
  editRecurringBudgetData.amount = parseFloat(recurringBudget.amount)
  editRecurringBudgetData.frequency = recurringBudget.frequency as
    | "monthly"
    | "quarterly"
    | "yearly"
  editRecurringBudgetData.startDate = recurringBudget.startDate
  editRecurringBudgetData.endDate = recurringBudget.endDate || undefined
  editRecurringBudgetData.description = recurringBudget.description || ""
  isEditRecurringBudgetModalOpen.value = true
}

function openDeactivateRecurringBudgetModal(
  recurringBudget: RecurringBudgetInjection
) {
  selectedRecurringBudget.value = recurringBudget
  isDeactivateRecurringBudgetModalOpen.value = true
}

// API Action Handlers for recurring budget
async function handleAddRecurringBudget(
  event: FormSubmitEvent<RecurringBudgetSchema>
) {
  if (!projectId) return
  isSaving.value = true
  try {
    const { error } = await $eden.api.projects
      .id({
        id: projectId,
      })
      ["recurring-budget"].post({
        amount: event.data.amount,
        frequency: event.data.frequency,
        startDate: event.data.startDate,
        endDate: event.data.endDate,
        description: event.data.description,
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
        description: "Recurring budget injection added.",
        color: "success",
      })
      isAddRecurringBudgetModalOpen.value = false
      await refreshRecurringBudget()
      // Ensure the budget injection table reflects backfilled injections immediately
      await refreshProjectDetails()
    }
  } catch (error) {
    console.error("Failed to add recurring budget:", error)
    toast.add({
      title: "Error",
      description: "Could not add recurring budget.",
      color: "error",
    })
  } finally {
    isSaving.value = false
  }
}

async function handleUpdateRecurringBudget(
  event: FormSubmitEvent<RecurringBudgetSchema>
) {
  if (!selectedRecurringBudget.value?.id) return
  const injectionId = selectedRecurringBudget.value.id
  isSaving.value = true
  try {
    const { error } = await $eden.api.projects["recurring-budget"]({
      injectionId,
    }).put({
      amount: event.data.amount,
      frequency: event.data.frequency,
      startDate: event.data.startDate,
      endDate: event.data.endDate,
      description: event.data.description,
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
        description: "Recurring budget injection updated.",
        color: "success",
      })
      isEditRecurringBudgetModalOpen.value = false
      selectedRecurringBudget.value = null
    }
    await refreshRecurringBudget()
  } catch (error) {
    console.error("Failed to update recurring budget:", error)
    toast.add({
      title: "Error",
      description: "Could not update recurring budget.",
      color: "error",
    })
  } finally {
    isSaving.value = false
    await refreshProjectDetails()
  }
}

async function handleDeactivateRecurringBudget() {
  if (!selectedRecurringBudget.value?.id) return
  const injectionId = selectedRecurringBudget.value.id
  isDeleting.value = true
  try {
    const { error } = await $eden.api.projects["recurring-budget"]({
      injectionId,
    })["deactivate"].patch()
    if (error) {
      toast.add({
        title: "Error",
        description: String(error.value),
        color: "error",
      })
    } else {
      toast.add({
        title: "Success",
        description: "Recurring budget injection deactivated.",
        color: "success",
      })
      isDeactivateRecurringBudgetModalOpen.value = false
      selectedRecurringBudget.value = null
      await refreshRecurringBudget()
    }
  } catch (error) {
    console.error("Failed to deactivate recurring budget:", error)
    toast.add({
      title: "Error",
      description: "Could not deactivate recurring budget.",
      color: "error",
    })
  } finally {
    isDeleting.value = false
  }
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
          class: "cursor-pointer",
          onClick: () => openEditInjectionModal(injection),
        }),
        h(UButton, {
          icon: "i-heroicons-trash",
          size: "xl",
          color: "error",
          variant: "outline",
          ariaLabel: "Delete",
          class: "cursor-pointer",
          onClick: () => openDeleteConfirmationModal(injection),
        }),
      ])
    },
  },
]

const budgetInjections = computed<BudgetInjection[]>(() => {
  const list = projectDetails.value?.budgetInjections ?? []
  // Sort by date descending (most recent first)
  return [...list].sort((a, b) => {
    const aTs = $dayjs(a.date).valueOf()
    const bTs = $dayjs(b.date).valueOf()
    return bTs - aTs
  })
})
const costOverTime = computed(() => projectDetails.value?.costOverTime ?? [])

const totalBudget = computed(() => {
  return budgetInjections.value.reduce((sum: number, b) => sum + b.amount, 0)
})

const totalCost = computed(() => {
  return costOverTime.value.reduce((sum: number, e) => sum + e.cost, 0)
})

const currentProfit = computed(() => totalBudget.value - totalCost.value)

// Computed properties for recurring budget
const recurringBudget = computed(
  () => recurringBudgetData.value?.recurringBudget || null
)

// Helper to format date for the button
function formatDateButton(date: Date | undefined | string) {
  return date ? $dayjs(date).format("YYYY-MM-DD") : "Select Date"
}

const frequencyOptions = [
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Yearly", value: "yearly" },
]
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

      <!-- Recurring Budget Section -->
      <div class="mt-8">
        <div class="flex justify-between items-center mb-2">
          <h3 class="font-semibold">Recurring Budget</h3>
        </div>

        <!-- Active Recurring Budget Display -->
        <div
          v-if="recurringBudget"
          class="mt-4"
        >
          <UCard>
            <template #header>
              <div class="flex justify-between items-center">
                <span>Active Recurring Budget</span>
                <div class="flex gap-2">
                  <UButton
                    icon="i-heroicons-pencil-square"
                    size="sm"
                    color="warning"
                    variant="outline"
                    @click="openEditRecurringBudgetModal(recurringBudget)"
                  />
                  <UButton
                    icon="i-heroicons-x-circle"
                    size="sm"
                    color="error"
                    variant="outline"
                    @click="openDeactivateRecurringBudgetModal(recurringBudget)"
                  />
                </div>
              </div>
            </template>
            <div class="space-y-2">
              <div class="flex justify-between">
                <span class="font-medium">Amount:</span>
                <span class="font-mono"
                  >${{ parseFloat(recurringBudget.amount).toFixed(2) }}</span
                >
              </div>
              <div class="flex justify-between">
                <span class="font-medium">Frequency:</span>
                <span class="capitalize">{{ recurringBudget.frequency }}</span>
              </div>
              <div class="flex justify-between">
                <span class="font-medium">Start Date:</span>
                <span>{{
                  $dayjs(recurringBudget.startDate).format("YYYY-MM-DD")
                }}</span>
              </div>
              <div
                v-if="recurringBudget.endDate"
                class="flex justify-between"
              >
                <span class="font-medium">End Date:</span>
                <span>{{
                  $dayjs(recurringBudget.endDate).format("YYYY-MM-DD")
                }}</span>
              </div>
              <div
                v-if="recurringBudget.description"
                class="flex justify-between"
              >
                <span class="font-medium">Description:</span>
                <span>{{ recurringBudget.description }}</span>
              </div>
            </div>
          </UCard>
        </div>

        <!-- No Recurring Budget State -->
        <div
          v-else
          class="mt-4"
        >
          <UCard>
            <div class="text-center text-gray-500 py-8">
              <Icon
                name="i-heroicons-currency-dollar"
                class="w-12 h-12 mx-auto mb-4 text-gray-300"
              />
              <p class="text-lg font-medium mb-2">No Recurring Budget</p>
              <p class="text-sm mb-4">
                Set up a recurring budget injection to automatically add funds
                to this project.
              </p>
              <UButton
                icon="i-heroicons-plus-circle"
                size="sm"
                variant="solid"
                label="Add Recurring Budget"
                @click="openAddRecurringBudgetModal"
              />
            </div>
          </UCard>
        </div>

        <!-- Recurring Budget Modals -->
        <UModal
          v-model:open="isAddRecurringBudgetModalOpen"
          :prevent-close="isSaving"
        >
          <template #content>
            <UCard>
              <template #header>Add Recurring Budget</template>
              <UForm
                class="space-y-4"
                :schema="recurringBudgetSchema"
                :state="newRecurringBudgetData"
                @submit="handleAddRecurringBudget"
              >
                <UFormField
                  label="Amount"
                  name="amount"
                  class="w-full"
                  required
                >
                  <UInput
                    v-model.number="newRecurringBudgetData.amount"
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

                <UFormField
                  label="Frequency"
                  name="frequency"
                  class="w-full"
                  required
                >
                  <USelectMenu
                    v-model="newRecurringBudgetFrequency"
                    :items="frequencyOptions"
                    placeholder="Select frequency"
                    :disabled="isSaving"
                  />
                </UFormField>

                <UFormField
                  label="Start Date"
                  name="startDate"
                  class="w-full"
                  required
                >
                  <UInput
                    v-model="newRecurringBudgetData.startDate"
                    class="w-full"
                    type="date"
                    :disabled="isSaving"
                  />
                </UFormField>

                <UFormField
                  label="End Date (Optional)"
                  name="endDate"
                  class="w-full"
                >
                  <UInput
                    v-model="newRecurringBudgetData.endDate"
                    class="w-full"
                    type="date"
                    :disabled="isSaving"
                  />
                </UFormField>

                <UFormField
                  label="Description"
                  name="description"
                  class="w-full"
                >
                  <UInput
                    v-model="newRecurringBudgetData.description"
                    class="w-full"
                    :disabled="isSaving"
                  />
                </UFormField>

                <div class="flex justify-end gap-2 mt-4">
                  <UButton
                    label="Cancel"
                    variant="ghost"
                    :disabled="isSaving"
                    @click="isAddRecurringBudgetModalOpen = false"
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
          v-model:open="isEditRecurringBudgetModalOpen"
          :prevent-close="isSaving"
        >
          <template #content>
            <UCard v-if="selectedRecurringBudget">
              <template #header>Edit Recurring Budget</template>
              <UForm
                class="space-y-4"
                :schema="recurringBudgetSchema"
                :state="editRecurringBudgetData"
                @submit="handleUpdateRecurringBudget"
              >
                <UFormField
                  label="Amount"
                  name="amount"
                  class="w-full"
                  required
                >
                  <UInput
                    v-model.number="editRecurringBudgetData.amount"
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

                <UFormField
                  label="Frequency"
                  name="frequency"
                  class="w-full"
                  required
                >
                  <USelectMenu
                    v-model="editRecurringBudgetFrequency"
                    :items="frequencyOptions"
                    placeholder="Select frequency"
                    :disabled="isSaving"
                  />
                </UFormField>

                <UFormField
                  label="Start Date"
                  name="startDate"
                  class="w-full"
                  required
                >
                  <UInput
                    v-model="editRecurringBudgetData.startDate"
                    class="w-full"
                    type="date"
                    :disabled="isSaving"
                  />
                </UFormField>

                <UFormField
                  label="End Date (Optional)"
                  name="endDate"
                  class="w-full"
                >
                  <UInput
                    v-model="editRecurringBudgetData.endDate"
                    class="w-full"
                    type="date"
                    :disabled="isSaving"
                  />
                </UFormField>

                <UFormField
                  label="Description"
                  name="description"
                  class="w-full"
                >
                  <UInput
                    v-model="editRecurringBudgetData.description"
                    class="w-full"
                    :disabled="isSaving"
                  />
                </UFormField>

                <div class="flex justify-end gap-2 mt-4">
                  <UButton
                    label="Cancel"
                    variant="ghost"
                    :disabled="isSaving"
                    @click="isEditRecurringBudgetModalOpen = false"
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
          v-model:open="isDeactivateRecurringBudgetModalOpen"
          :prevent-close="isDeleting"
        >
          <template #content>
            <UCard v-if="selectedRecurringBudget">
              <template #header>Confirm Deactivation</template>
              <p>
                Are you sure you want to deactivate the recurring budget
                injection for ${{
                  parseFloat(selectedRecurringBudget.amount).toFixed(2)
                }}
                ({{ selectedRecurringBudget.frequency }})?
              </p>
              <p class="text-sm text-gray-500 mt-2">
                This will stop future automatic budget injections but won't
                affect existing ones.
              </p>
              <template #footer>
                <div class="flex justify-end gap-2">
                  <UButton
                    label="Cancel"
                    variant="ghost"
                    :disabled="isDeleting"
                    @click="isDeactivateRecurringBudgetModalOpen = false"
                  />
                  <UButton
                    label="Deactivate"
                    color="error"
                    :loading="isDeleting"
                    @click="handleDeactivateRecurringBudget"
                  />
                </div>
              </template>
            </UCard>
          </template>
        </UModal>
      </div>

      <!-- Monthly Breakdown Section (always shown) -->
      <div class="mt-8">
        <AdminMonthlyBreakdownTable :project-id="projectId" />
      </div>
    </UCard>
  </div>
</template>
