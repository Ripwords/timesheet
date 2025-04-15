import { baseApp } from "../../utils/baseApp"
import * as schema from "../db/schema"
import { t } from "elysia"
import { eq } from "drizzle-orm"
import { authGuard } from "../middleware/authGuard"
export const projects = baseApp("projects").group("/projects", (app) =>
  app
    .use(authGuard)
    // CREATE Project
    .post(
      "/",
      async ({ db, body, error, getUser }) => {
        const user = await getUser()
        if (user?.role !== "admin") {
          return error(403, "Forbidden")
        }

        try {
          const newProject = await db
            .insert(schema.projects)
            .values({
              name: body.name,
              // Assuming createdAt and updatedAt are handled by the DB or ORM defaults
            })
            .returning() // Return the newly created project

          if (!newProject || newProject.length === 0) {
            return error(500, "Failed to create project")
          }

          return newProject[0]
        } catch (e) {
          console.error("Failed to create project:", e)
          // Consider more specific error handling based on potential DB errors
          // Example check for specific constraints if needed
          // if (e instanceof Error && e.message.includes(...)) {
          //     return error(400, `...`);
          // }
          return error(500, "Internal Server Error")
        }
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1 }),
          // description: t.Optional(t.String()), // Removed
          // clientId: t.Numeric(), // Removed
        }),
        detail: {
          summary: "Create a new project",
          tags: ["Projects"],
        },
      }
    )
    // READ All Projects
    .get(
      "/",
      async ({ db }) => {
        const allProjects = await db.query.projects.findMany({
          orderBy: (projects, { desc }) => [desc(projects.createdAt)],
        })

        console.log(allProjects)

        return allProjects
      },
      {
        detail: {
          summary: "Get all projects",
          tags: ["Projects"],
        },
      }
    )
    // READ Single Project
    .get(
      "/id/:id",
      async ({ db, params, error }) => {
        const projectId = params.id
        const project = await db.query.projects.findFirst({
          where: eq(schema.projects.id, projectId),
        })

        if (!project) {
          return error(404, "Project not found")
        }
        return project
      },
      {
        params: t.Object({
          id: t.Numeric(),
        }),
        detail: {
          summary: "Get a single project by ID",
          tags: ["Projects"],
        },
      }
    )
    // UPDATE Project
    .put(
      "/id/:id",
      async ({ db, params, body, error, getUser }) => {
        const user = await getUser()
        if (user?.role !== "admin") {
          return error(403, "Forbidden")
        }

        const projectId = params.id

        // Check if project exists first
        const existingProject = await db.query.projects.findFirst({
          where: eq(schema.projects.id, projectId),
          columns: { id: true }, // Only fetch id for existence check
        })

        if (!existingProject) {
          return error(404, "Project not found")
        }

        try {
          const updatedProject = await db
            .update(schema.projects)
            .set({
              name: body.name, // Only update fields present in the body
              // description: body.description, // Removed
              // clientId: body.clientId, // Removed
              // updatedAt: new Date(), // Removed: Assume DB handles this
            })
            .where(eq(schema.projects.id, projectId))
            .returning() // Return the updated project

          if (!updatedProject || updatedProject.length === 0) {
            return error(500, "Failed to update project")
          }

          return updatedProject[0]
        } catch (e) {
          console.error(`Failed to update project ${projectId}:`, e)
          // Consider more specific error handling based on potential DB errors
          // if (e instanceof Error && ...) {
          //     return error(400, `...`);
          // }
          return error(500, "Internal Server Error")
        }
      },
      {
        params: t.Object({
          id: t.Numeric(),
        }),
        body: t.Object({
          // Only allow updating fields that are confirmed to exist
          name: t.Optional(t.String({ minLength: 1 })),
          // description: t.Optional(t.String()), // Removed
          // clientId: t.Optional(t.Numeric()), // Removed
        }),
        detail: {
          summary: "Update a project by ID",
          tags: ["Projects"],
        },
      }
    )
    // DELETE Project
    .delete(
      "/id/:id",
      async ({ db, params, error, set, getUser }) => {
        const user = await getUser()
        if (user?.role !== "admin") {
          return error(403, "Forbidden")
        }

        const projectId = params.id

        try {
          const deletedProject = await db
            .delete(schema.projects)
            .where(eq(schema.projects.id, projectId))
            .returning({ id: schema.projects.id }) // Return the id of the deleted item

          if (!deletedProject || deletedProject.length === 0) {
            // If nothing was returned, the project didn't exist
            return error(404, "Project not found")
          }

          set.status = 200 // Explicitly set 200 OK
          return { message: `Project ${projectId} deleted successfully` }
        } catch (e) {
          console.error(`Failed to delete project ${projectId}:`, e)
          // Handle potential database errors, e.g., related constraints if project deletion affects other tables.
          // If there's a foreign key constraint preventing deletion, you might return a 409 Conflict.
          // Example: if (e.message.includes('violates foreign key constraint')) {
          //     return error(409, "Cannot delete project because it is referenced by other records (e.g., time entries)");
          // }
          return error(500, "Internal Server Error")
        }
      },
      {
        params: t.Object({
          id: t.Numeric(),
        }),
        detail: {
          summary: "Delete a project by ID",
          tags: ["Projects"],
        },
      }
    )
)
