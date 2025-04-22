<script setup lang="ts">
import type { ColumnDef, CellContext } from "@tanstack/vue-table"
import { UBadge, UButton } from "#components"

definePageMeta({
  middleware: "admin",
})

const dayjs = useDayjs()

// Uncomment and use correct type inference
type UsersResponse = Awaited<
  ReturnType<typeof eden.api.admin.users.index.get> // Use the newly created endpoint
>["data"]
type User = NonNullable<UsersResponse>[number] // Get the item type from the array

const eden = useEden() // Uncomment eden
const { data: users, status } = await useLazyAsyncData(
  "users-admin",
  async () => {
    const { data } = await eden.api.admin.users.index.get()
    return data ?? []
  }
)

// Helper function for date formatting
const formatDate = (date: string | Date | null) => {
  return date ? dayjs(date).format("MMM D, YYYY") : "N/A"
}

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
    <UCard>
      <UTable
        :data="users"
        :columns
        :empty-state="{
          icon: 'i-heroicons-user-group',
          label: 'No users found.', // Restore default label
        }"
        :loading="status === 'pending'"
      />
    </UCard>
  </div>
</template>
