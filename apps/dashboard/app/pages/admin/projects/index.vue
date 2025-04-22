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

const { data: projects, status } = await useLazyAsyncData(
  "projects-admin",
  async () => {
    const { data } = await eden.api.projects.index.get()
    console.log("projects", data)
    return data ?? []
  }
)

// Define columns using accessorKey/label for data, key/label for actions
const columns: ColumnDef<Project, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "updatedAt", header: "Updated At" },
  {
    id: "actions",
    header: "Actions",
    cell: (context: CellContext<Project, unknown>) => {
      const project = context.row.original as Project
      return h("div", { class: "space-x-2" }, [
        h(UButton, {
          icon: "i-heroicons-eye",
          size: "xl",
          variant: "outline",
          color: "primary",
          ariaLabel: "View Details",
          onClick: () => viewProjectDetails(Number(project.id)),
        }),
        h(UButton, {
          icon: "i-heroicons-pencil-square",
          size: "xl",
          variant: "outline",
          color: "warning",
          ariaLabel: "Edit",
          onClick: () => editProject(project),
        }),
        h(UButton, {
          icon: "i-heroicons-trash",
          size: "xl",
          variant: "outline",
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

    <UCard>
      <UTable
        :data="projects"
        :columns="columns"
        :empty-state="{
          icon: 'i-heroicons-circle-stack',
          label: 'No projects found.',
        }"
        :loading="status === 'pending'"
      >
        <template #updatedAt-cell="{ row }">
          {{ dayjs(row.original.updatedAt).format("MMM D, hh:mm A") }}
        </template>
      </UTable>
    </UCard>
  </div>
</template>
