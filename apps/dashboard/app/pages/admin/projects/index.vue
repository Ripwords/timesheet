<script setup lang="ts">
import type { ColumnDef, CellContext } from "@tanstack/vue-table"
import { UButton } from "#components"

definePageMeta({
  middleware: "admin",
})

// Infer the response type, then extract the non-nullable array item type
type ProjectsResponse = Awaited<
  ReturnType<typeof eden.api.projects.index.get>
>["data"]
type Project = NonNullable<ProjectsResponse>[number] // Get the item type from the array

const eden = useEden()
const dayjs = useDayjs()

const {
  data: projects,
  status,
  error,
} = await useLazyAsyncData("projects", async () => {
  const { data } = await eden.api.projects.index.get()
  return data ?? []
})

// Define columns using accessorKey/label for data, key/label for actions
const columns: ColumnDef<Project, unknown>[] = [
  { accessorKey: "id", header: "ID", enableSorting: true },
  { accessorKey: "name", header: "Name", enableSorting: true },
  { accessorKey: "updatedAt", header: "Updated At", enableSorting: true },
  {
    id: "actions",
    header: "Actions",
    cell: (context: CellContext<Project, unknown>) => {
      const project = context.row.original as Project
      return h("div", { class: "space-x-2" }, [
        h(UButton, {
          icon: "i-heroicons-eye",
          size: "xs",
          variant: "ghost",
          color: "primary",
          ariaLabel: "View Details",
          onClick: () => viewProjectDetails(Number(project.id)),
        }),
        h(UButton, {
          icon: "i-heroicons-pencil-square",
          size: "xs",
          variant: "ghost",
          color: "warning",
          ariaLabel: "Edit",
          onClick: () => editProject(project),
        }),
        h(UButton, {
          icon: "i-heroicons-trash",
          size: "xs",
          variant: "ghost",
          color: "error",
          ariaLabel: "Delete",
          onClick: () => deleteProject(project),
        }),
      ])
    },
  },
]

function viewProjectDetails(projectId: number) {
  useRouter().push(`/admin/projects/${projectId}`)
}

function editProject(project: Project) {
  console.log("Edit project:", project.id)
  alert(`Editing project ID: ${project.id} (Not implemented)`)
}

function deleteProject(project: Project) {
  console.log("Delete project:", project.id)
  if (confirm(`Are you sure you want to delete project "${project.name}"?`)) {
    alert(`Deleting project ID: ${project.id} (Not implemented)`)
  }
}
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-semibold">Manage Projects</h1>
      <UButton
        icon="i-heroicons-plus-circle"
        label="New Project"
        @click="useRouter().push('/admin/projects/new')"
      />
    </div>

    <div
      v-if="status === 'pending'"
      class="text-center py-4"
    >
      Loading projects...
    </div>
    <div
      v-if="status === 'error'"
      class="text-red-500 bg-red-100 p-3 rounded mb-4"
    >
      Error loading projects: {{ error }}
    </div>

    <UCard v-if="projects">
      <UTable
        :data="projects"
        :columns="columns"
        :empty-state="{
          icon: 'i-heroicons-circle-stack',
          label: 'No projects found.',
        }"
      >
        <template #updatedAt-cell="{ row }">
          {{ dayjs(row.original.updatedAt).format("YYYY-MM-DD HH:mm:ss") }}
        </template>
      </UTable>
    </UCard>
  </div>
</template>
