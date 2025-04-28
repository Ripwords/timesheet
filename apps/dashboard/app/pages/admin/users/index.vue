<script setup lang="ts">
import type { ColumnDef, CellContext } from "@tanstack/vue-table"

import {
  UButton,
  UBadge,
  UModal,
  UForm,
  UFormField,
  UInput,
  USelectMenu,
  UIcon,
  UCard,
} from "#components"
import { useToast } from "#imports"

definePageMeta({
  middleware: "admin",
})

type UsersResponse = Awaited<
  ReturnType<typeof eden.api.admin.users.index.get>
>["data"]
type User = Omit<
  NonNullable<UsersResponse>["users"][number],
  "emailVerified"
> & {
  emailVerified: boolean | null
}

const eden = useEden()
const toast = useToast()
const page = ref(1)
const search = ref("")
const departmentId = ref(0)
const isEditModalOpen = ref(false)
const editingUser = ref<User | null>(null) // Store the user being edited
const editedData = reactive<{
  email: string
  departmentId: number | undefined
  emailVerified: boolean | null
}>({
  email: "",
  departmentId: undefined,
  emailVerified: null,
})
const isSaving = ref(false)
const isVerifying = ref(false)

const { data: departments } = await useLazyAsyncData(
  "departments",
  async () => {
    const { data } = await eden.api.admin.departments.index.get({
      query: {},
    })

    return data ?? []
  }
)
const {
  data: users,
  status,
  refresh,
} = await useLazyAsyncData(
  "users-admin",
  async () => {
    const { data } = await eden.api.admin.users.index.get({
      query: {
        page: page.value,
        ...(search.value && { search: search.value }),
        ...(departmentId.value && { departmentId: departmentId.value }),
      },
    })
    return {
      users: data?.users ?? [],
      total: data?.total ?? 0,
    }
  },
  {
    watch: [page, departmentId],
  }
)

watchDebounced(
  search,
  async () => {
    await refresh()
  },
  { debounce: 150 }
)

// Define columns using TanStack types and cell functions with INFERRED User type
const columns: ColumnDef<User, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "department", header: "Department" },
  {
    accessorKey: "emailVerified",
    header: "Email Verified",
    enableSorting: true,
    cell: (context: CellContext<User, unknown>) => {
      const verificationStatus = context.row.original.emailVerified
      const isVerified = verificationStatus === true
      const isExplicitlyNotVerified = verificationStatus === false

      return h(
        UBadge,
        {
          color: isVerified
            ? "success"
            : isExplicitlyNotVerified
            ? "error"
            : "neutral",
          variant: "subtle",
        },
        () =>
          isVerified
            ? "Verified"
            : isExplicitlyNotVerified
            ? "Not Verified"
            : "Unknown"
      )
    },
  },
  {
    header: "Hours (week)",
    enableSorting: true,
    cell: (context: CellContext<User, unknown>) => {
      const totalHours = context.row.original.totalHoursThisWeek
      return h("div", { class: "text-right" }, [
        h("span", { class: "text-sm" }, `${totalHours.toFixed(2)}`),
      ])
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: (context: CellContext<User, unknown>) => {
      const user = context.row.original
      return h("div", { class: "space-x-2" }, [
        h(UButton, {
          icon: "i-heroicons-eye",
          size: "xl",
          variant: "outline",
          color: "primary",
          ariaLabel: "View Details",
          onClick: () => viewUserDetails(String(user.id)),
        }),
        h(UButton, {
          icon: "i-heroicons-pencil-square",
          size: "xl",
          variant: "outline",
          color: "warning",
          ariaLabel: "Edit",
          onClick: () => editUser(user),
        }),
        h(UButton, {
          icon: "i-heroicons-trash",
          size: "xl",
          variant: "outline",
          color: "error",
          ariaLabel: "Delete",
          onClick: () => deleteUser(user),
        }),
      ])
    },
  },
]

function viewUserDetails(userId: number | string) {
  useRouter().push(`/admin/users/${userId}`)
}

function editUser(user: User) {
  editingUser.value = JSON.parse(JSON.stringify(user))
  if (editingUser.value) {
    editedData.email = editingUser.value.email ?? ""
    editedData.departmentId = editingUser.value.departmentId ?? undefined
    isEditModalOpen.value = true
  }
}

function deleteUser(user: User) {
  console.log("Delete user:", user.id)
  if (confirm(`Are you sure you want to delete user "${user.email}"?`)) {
    alert(`Deleting user ID: ${user.id} (Not implemented)`)
  }
}

async function saveUserChanges() {
  if (!editingUser.value) return
  isSaving.value = true

  const userId = editingUser.value.id
  const payload: {
    email?: string
    departmentId?: number
  } = {}

  if (editedData.email !== editingUser.value.email) {
    payload.email = editedData.email
  }
  if (editedData.departmentId !== editingUser.value.departmentId) {
    payload.departmentId = editedData.departmentId
  }

  if (Object.keys(payload).length === 0) {
    toast.add({ title: "No Changes Detected", color: "warning" })
    isSaving.value = false
    isEditModalOpen.value = false
    return
  }

  try {
    const updatedUserResponse = await eden.api.admin
      .users({ id: userId })
      .patch(payload)
    // Access .data property
    toast.add({
      title: "User Updated",
      description: `User ${updatedUserResponse.data?.email} updated successfully.`,
      color: "success",
    })
    isEditModalOpen.value = false
    await refresh()
    editingUser.value = null
  } catch (error: unknown) {
    console.error("Failed to update user:", error)
    let message = `Failed to update user ${editingUser.value?.id}.`
    if (
      error &&
      typeof error === "object" &&
      "value" in error &&
      error.value &&
      typeof error.value === "object" &&
      "message" in error.value
    ) {
      message = String(error.value.message) || message
    }
    toast.add({ title: "Update Failed", description: message, color: "error" })
  } finally {
    isSaving.value = false
    await refresh()
  }
}

async function verifyUserEmail() {
  if (!editingUser.value) return
  isVerifying.value = true
  const result = await eden.api.admin
    .users({ id: editingUser.value.id })
    .patch({ emailVerified: true })
  isVerifying.value = false
  if (result.data) {
    editingUser.value.emailVerified = result.data.emailVerified
    toast.add({
      title: "Email Verified",
      description: `Email for ${editingUser.value.email} verified successfully.`,
      color: "success",
    })
  } else {
    toast.add({
      title: "Email Verification Failed",
      description: `Failed to verify email for ${editingUser.value.email}.`,
      color: "error",
    })
  }

  await refresh()
}

function cancelEdit() {
  isEditModalOpen.value = false
  editingUser.value = null
}
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-semibold">Manage Users</h1>
    </div>
    <UCard>
      <template #header>
        <div class="flex gap-3">
          <UInput
            v-model="search"
            class="w-[30vw]"
            placeholder="Search..."
          />
          <USelectMenu
            v-model="departmentId"
            class="w-50"
            placeholder="Select Department"
            :items="[...departments]"
            value-key="id"
            label-key="departmentName"
            :search-input="{
              placeholder: 'Search items...',
            }"
          >
            <template #item="{ item }">
              <Department :department-id="item.id" />
            </template>
            <template #default="{ modelValue }">
              <Department
                v-if="modelValue"
                :department-id="modelValue"
              />
            </template>
            <template #trailing>
              <button
                v-if="departmentId"
                :class="['ml-2 px-1  hover:text-red-600 !pointer-events-auto']"
                @click.stop="
                  () => {
                    departmentId = 0
                  }
                "
              >
                ✕
              </button>
            </template>
          </USelectMenu>
        </div>
      </template>
      <UTable
        :pagination="{
          pageIndex: page,
          pageSize: 10,
        }"
        :data="users?.users ?? []"
        :columns
        :empty-state="{
          icon: 'i-heroicons-user-group',
          label: 'No users found.',
        }"
        :loading="status === 'pending'"
      >
        <template #department-cell="{ row }">
          <Department :department-id="row.original.departmentId" />
        </template>
      </UTable>
      <div class="flex justify-center border-t border-default pt-4">
        <UPagination
          :items-per-page="10"
          :total="users?.total ?? 0"
          @update:page="(p) => (page = p)"
        />
      </div>
    </UCard>

    <!-- Edit User Modal -->
    <UModal
      v-model:open="isEditModalOpen"
      :prevent-close="isSaving || isVerifying"
    >
      <template #content>
        <UCard v-if="editingUser">
          <template #header>
            <div class="flex items-center justify-between">
              <h3
                class="text-base font-semibold leading-6 text-gray-900 dark:text-white"
              >
                Edit User: {{ editingUser.email }}
              </h3>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-x-mark-20-solid"
                class="-my-1"
                :disabled="isSaving || isVerifying"
                @click="cancelEdit"
              />
            </div>
          </template>

          <UForm
            :state="editedData"
            @submit.prevent="saveUserChanges"
          >
            <UFormField
              label="Email"
              name="email"
              class="mb-4"
            >
              <UInput
                v-model="editedData.email"
                class="w-50"
                :disabled="isSaving || isVerifying"
              />
            </UFormField>

            <UFormField
              label="Department"
              name="department"
              class="mb-4"
            >
              <USelectMenu
                v-model="editedData.departmentId"
                class="w-50"
                placeholder="Select Department"
                :items="[...departments]"
                value-key="id"
                label-key="departmentName"
                :search-input="{ placeholder: 'Search departments...' }"
                :disabled="isSaving || isVerifying"
              >
                <template #item="{ item }">
                  <Department :department-id="item.id" />
                </template>
                <template #default="{ modelValue }">
                  <Department
                    v-if="modelValue"
                    :department-id="modelValue"
                  />
                  <span
                    v-else
                    class="text-gray-500 dark:text-gray-400"
                    >Select Department</span
                  >
                </template>
              </USelectMenu>
            </UFormField>

            <UFormField
              label="Email Verification"
              name="verification"
              class="mb-4"
            >
              <div
                v-if="editingUser.emailVerified === true"
                class="flex items-center gap-2"
              >
                <UIcon
                  name="i-heroicons-check-circle"
                  class="text-green-500"
                />
                <span>Verified</span>
              </div>
              <UButton
                v-else
                icon="i-heroicons-envelope"
                color="primary"
                variant="outline"
                label="Verify Email Now"
                :loading="isVerifying"
                :disabled="isSaving"
                @click="verifyUserEmail"
              />
            </UFormField>

            <div class="flex justify-end gap-3 mt-6">
              <UButton
                label="Cancel"
                color="neutral"
                variant="ghost"
                :disabled="isSaving || isVerifying"
                @click="cancelEdit"
              />
              <UButton
                type="submit"
                label="Save Changes"
                color="primary"
                :loading="isSaving"
                :disabled="isVerifying"
              />
            </div>
          </UForm> </UCard
      ></template>
    </UModal>
  </div>
</template>
