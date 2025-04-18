<script setup lang="ts">
import type { ColumnDef, CellContext } from "@tanstack/vue-table"
import { UBadge, UButton } from "#components"

definePageMeta({
  middleware: "admin",
})

// Uncomment and use correct type inference
type UsersResponse = Awaited<
  ReturnType<typeof eden.api.admin.users.index.get> // Use the newly created endpoint
>["data"]
type User = NonNullable<UsersResponse>[number] // Get the item type from the array

const eden = useEden() // Uncomment eden
const {
  data: users,
  status,
  error,
} = await useLazyAsyncData("users", async () => {
  const { data } = await eden.api.admin.users.index.get()
  return data ?? []
})

// Helper function for date formatting
const formatDate = (date: string | Date | null) => {
  return date ? new Date(date).toLocaleDateString() : "N/A"
}

// Define columns using TanStack types and cell functions with INFERRED User type
const columns: ColumnDef<User, unknown>[] = [
  { accessorKey: "id", header: "ID", enableSorting: true },
  { accessorKey: "email", header: "Email", enableSorting: true },
  { accessorKey: "role", header: "Role", enableSorting: true },
  {
    accessorKey: "emailVerified",
    header: "Email Verified",
    enableSorting: true,
    cell: (context: CellContext<User, unknown>) => {
      const isVerified = context.row.original.emailVerified
      return h(
        UBadge,
        {
          color:
            isVerified === null ? "neutral" : isVerified ? "success" : "error",
          variant: "subtle",
        },
        () =>
          isVerified === null
            ? "Unknown"
            : isVerified
            ? "Verified"
            : "Not Verified"
      )
    },
  },
  {
    accessorKey: "createdAt",
    header: "Created At",
    enableSorting: true,
    cell: (context: CellContext<User, unknown>) => {
      return formatDate(context.row.original.createdAt)
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
          size: "xs",
          variant: "ghost",
          color: "primary",
          ariaLabel: "View Details",
          onClick: () => viewUserDetails(String(user.id)),
        }),
        h(UButton, {
          icon: "i-heroicons-pencil-square",
          size: "xs",
          variant: "ghost",
          color: "warning",
          ariaLabel: "Edit",
          onClick: () => editUser(user),
        }),
        h(UButton, {
          icon: "i-heroicons-trash",
          size: "xs",
          variant: "ghost",
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
  console.log("Edit user:", user.id)
  alert(`Editing user ID: ${user.id} (Not implemented)`)
}

function deleteUser(user: User) {
  console.log("Delete user:", user.id)
  if (confirm(`Are you sure you want to delete user "${user.email}"?`)) {
    alert(`Deleting user ID: ${user.id} (Not implemented)`)
  }
}
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-semibold">Manage Users</h1>
    </div>

    <div
      v-if="status === 'pending'"
      class="text-center py-4"
    >
      Loading users...
    </div>
    <div
      v-if="error"
      class="text-red-500 bg-red-100 p-3 rounded mb-4"
    >
      Error loading users: {{ error }}
    </div>

    <UCard v-if="status === 'success'">
      <UTable
        :data="users"
        :columns
        :empty-state="{
          icon: 'i-heroicons-user-group',
          label: 'No users found.', // Restore default label
        }"
      >
        <!-- Rendering handled by cell functions, no slots needed -->
      </UTable>
    </UCard>
  </div>
</template>
