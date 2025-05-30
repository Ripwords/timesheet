<script setup lang="ts">
import type { ColumnDef, CellContext } from "@tanstack/vue-table"
import { UButton } from "#components"

definePageMeta({
  middleware: "admin",
})

useSeoMeta({
  title: "Timesheet | Admin Projects",
  description: "Manage projects in the application",
})

// Infer the response type, then extract the non-nullable array item type
type ProjectsResponse = Awaited<
  ReturnType<typeof $eden.api.projects.get>
>["data"]
type Project = NonNullable<ProjectsResponse>["projects"][number] // Get the item type from the array

const { $eden } = useNuxtApp()
const dayjs = useDayjs()
const page = ref(1)
const search = ref("")
const sort = ref<"createdAt" | "name">("createdAt")
const order = ref<"asc" | "desc">("desc")
const toast = useToast()
const projectStatus = ref(true) // true for active, false for inactive

// State for the new project modal
const isNewProjectModalOpen = ref(false)
const newProjectName = ref("")
const isCreatingProject = ref(false) // For loading state on button

// State for delete confirmation modal
const isDeleteConfirmModalOpen = ref(false)
const projectToDelete = ref<Project | null>(null)
const isDeletingProject = ref(false)

// State for edit modal
const isEditModalOpen = ref(false)
const projectToEdit = ref<Project | null>(null)
const editedProjectName = ref("")
const isUpdatingProject = ref(false)

const {
  data: projects,
  status,
  refresh,
} = await useLazyAsyncData(
  `projects-admin-${projectStatus.value ? "active" : "inactive"}`,
  async () => {
    const { data } = await $eden.api.projects.get({
      query: {
        page: page.value,
        search: search.value,
        sort: sort.value,
        order: order.value,
        isActive: projectStatus.value,
      },
    })
    return {
      projects: data?.projects ?? [],
      total: data?.total ?? 0,
    }
  },
  {
    watch: [page, sort, order, projectStatus],
  }
)

watchDebounced(
  search,
  async () => {
    await refresh()
  },
  { debounce: 150 }
)

// Define columns using accessorKey/label for data, key/label for actions
const columns: ColumnDef<Project, unknown>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: (context: CellContext<Project, unknown>) =>
      h("div", {}, [
        h(
          "span",
          { class: "text-sm" },
          `${context.row.original.id.slice(
            0,
            8
          )}...${context.row.original.id.slice(-4)}`
        ),
      ]),
  },
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
          onClick: () => viewProjectDetails(project.id),
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
          icon: projectStatus.value ? "i-heroicons-trash" : "i-heroicons-check",
          size: "xl",
          variant: "outline",
          color: projectStatus.value ? "error" : "success",
          ariaLabel: projectStatus.value ? "Deactivate" : "Activate",
          loading:
            isDeletingProject.value && projectToDelete.value?.id === project.id,
          onClick: () =>
            projectStatus.value
              ? deleteProject(project)
              : activateProject(project),
        }),
      ])
    },
  },
]

function viewProjectDetails(projectId: string) {
  useRouter().push(`/admin/projects/${projectId}`)
}

function editProject(project: Project) {
  projectToEdit.value = project
  editedProjectName.value = project.name // Pre-fill with current name
  isEditModalOpen.value = true
}

function deleteProject(project: Project) {
  projectToDelete.value = project
  isDeleteConfirmModalOpen.value = true
}

function activateProject(project: Project) {
  projectToDelete.value = project
  isDeleteConfirmModalOpen.value = true
}

// Function to handle the actual action after confirmation
async function confirmProjectAction() {
  if (!projectToDelete.value) return

  isDeletingProject.value = true
  try {
    if (projectStatus.value) {
      // Deactivate project
      const { error } = await $eden.api.projects
        .id({ id: projectToDelete.value.id })
        .delete()

      if (error) {
        const errorMessage =
          typeof error.value === "object" &&
          error.value !== null &&
          "message" in error.value
            ? String(error.value.message)
            : String(error.value) || "Failed to deactivate project."

        toast.add({
          title: `Error (${error.status})`,
          description: errorMessage,
          color: "error",
        })
      } else {
        toast.add({
          title: "Success",
          description: `Project "${projectToDelete.value.name}" deactivated successfully.`,
          color: "success",
        })
        await refresh()
      }
    } else {
      // Activate project
      const { error } = await $eden.api.projects
        .id({ id: projectToDelete.value.id })
        .activate.patch()

      if (error) {
        const errorMessage =
          typeof error.value === "object" &&
          error.value !== null &&
          "message" in error.value
            ? String(error.value.message)
            : String(error.value) || "Failed to activate project."

        toast.add({
          title: `Error (${error.status})`,
          description: errorMessage,
          color: "error",
        })
      } else {
        toast.add({
          title: "Success",
          description: `Project "${projectToDelete.value.name}" activated successfully.`,
          color: "success",
        })
        await refresh()
      }
    }
  } catch (err: unknown) {
    toast.add({
      title: "Error",
      description:
        err instanceof Error ? err.message : "An unexpected error occurred.",
      color: "error",
    })
  } finally {
    isDeletingProject.value = false
    isDeleteConfirmModalOpen.value = false
    projectToDelete.value = null
  }
}

// Function to handle updating a project name
async function updateProject() {
  if (!projectToEdit.value) return
  if (!editedProjectName.value.trim()) {
    toast.add({
      title: "Error",
      description: "Project name cannot be empty.",
      color: "error",
    })
    return
  }
  // Check if name hasn't actually changed
  if (editedProjectName.value.trim() === projectToEdit.value.name) {
    isEditModalOpen.value = false // Just close if no change
    return
  }

  isUpdatingProject.value = true
  try {
    const { data, error } = await $eden.api.projects
      .id({ id: projectToEdit.value.id })
      .put({
        name: editedProjectName.value.trim(),
      })

    if (error) {
      const errorMessage =
        typeof error.value === "object" &&
        error.value !== null &&
        "message" in error.value
          ? String(error.value.message)
          : String(error.value) || "Failed to update project."
      toast.add({
        title: `Error (${error.status})`,
        description: errorMessage,
        color: "error",
      })
    } else {
      toast.add({
        title: "Success",
        description: `Project "${data?.name}" updated successfully.`,
        color: "success",
      })
      await refresh() // Refresh the project list
    }
  } catch (err: unknown) {
    toast.add({
      title: "Error",
      description:
        err instanceof Error ? err.message : "An unexpected error occurred.",
      color: "error",
    })
  } finally {
    isUpdatingProject.value = false
    isEditModalOpen.value = false
    projectToEdit.value = null // Clear the selected project
    editedProjectName.value = "" // Clear the edit input
  }
}

// Function to create a new project
async function createProject() {
  if (!newProjectName.value.trim()) {
    toast.add({
      title: "Error",
      description: "Project name cannot be empty.",
      color: "error",
    })
    return
  }

  isCreatingProject.value = true
  try {
    const { data, error } = await $eden.api.projects.post({
      name: newProjectName.value.trim(),
    })

    if (error) {
      toast.add({
        title: "Error",
        description: String(error.value) || "Failed to create project",
        color: "error",
      })
      return
    }

    toast.add({
      title: "Success",
      description: `Project "${data?.name}" created successfully.`,
      color: "success",
    })
    isNewProjectModalOpen.value = false
    newProjectName.value = ""
    refresh()
  } catch (err: unknown) {
    console.error("Error creating project:", err)
    toast.add({
      title: "Error",
      description:
        err instanceof Error ? err.message : "An unexpected error occurred.",
      color: "error",
    })
  } finally {
    isCreatingProject.value = false
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
        @click="isNewProjectModalOpen = true"
      />
    </div>

    <UCard>
      <template #header>
        <div class="flex justify-between items-center gap-3">
          <UInput
            v-model="search"
            class="w-[30vw]"
            placeholder="Search..."
          />
          <USwitch
            v-model="projectStatus"
            :default-value="true"
            :loading="status === 'pending'"
            label="Active"
          />
        </div>
      </template>
      <UTable
        :data="projects?.projects ?? []"
        :columns="columns"
        :empty-state="{
          icon: 'i-heroicons-circle-stack',
          label: 'No projects found.',
        }"
        :loading="status === 'pending'"
        class="w-full"
      >
        <template #updatedAt-cell="{ row }">
          {{ dayjs(row.original.updatedAt).format("MMM D, hh:mm A") }}
        </template>
      </UTable>
      <div class="flex justify-center border-t border-default pt-4">
        <UPagination
          :items-per-page="10"
          :total="projects?.total ?? 0"
          @update:page="(p) => (page = p)"
        />
      </div>
    </UCard>

    <!-- New Project Modal -->
    <UModal v-model:open="isNewProjectModalOpen">
      <template #content>
        <AdminProjectsFormCard
          v-model="newProjectName"
          title="Create New Project"
          :loading="isCreatingProject"
          submit-label="Create"
          @submit="createProject"
          @cancel="isNewProjectModalOpen = false"
        />
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="isDeleteConfirmModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <h3
              class="text-lg font-semibold text-error-500 dark:text-error-400"
            >
              Confirm Action
            </h3>
          </template>

          <p class="mb-4">
            Are you sure you want to
            {{ projectStatus ? "deactivate" : "activate" }} the project
            <strong class="font-semibold"
              >"{{ projectToDelete?.name ?? "..." }}"</strong
            >?
            <br />
            <span class="text-sm text-warning-500 dark:text-warning-400"
              >This action
              {{
                projectStatus
                  ? "will deactivate the project and hide it from active project lists"
                  : "will reactivate the project and make it available again"
              }}.</span
            >
          </p>

          <template #footer>
            <div class="flex justify-end space-x-3">
              <UButton
                label="Cancel"
                variant="ghost"
                :disabled="isDeletingProject"
                @click="isDeleteConfirmModalOpen = false"
              />
              <UButton
                label="Confirm"
                :color="projectStatus ? 'error' : 'success'"
                :icon="
                  projectStatus ? 'i-heroicons-trash' : 'i-heroicons-check'
                "
                :loading="isDeletingProject"
                @click="confirmProjectAction"
              />
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <!-- Edit Project Modal -->
    <UModal v-model:open="isEditModalOpen">
      <template #content>
        <AdminProjectsFormCard
          v-model="editedProjectName"
          title="Edit Project"
          :loading="isUpdatingProject"
          submit-label="Update"
          @submit="updateProject"
          @cancel="isEditModalOpen = false"
        />
      </template>
    </UModal>
  </div>
</template>
