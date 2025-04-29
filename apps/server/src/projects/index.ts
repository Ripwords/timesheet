import { baseApp } from "../../utils/baseApp"
import * as schema from "../db/schema"
import { t } from "elysia"
import { and, count, eq, ilike } from "drizzle-orm"
import { authGuard } from "../middleware/authGuard"

const querySchema = t.Object({
  page: t.Optional(t.Number({ default: 1 })),
  limit: t.Optional(t.Number({ default: 10 })),
  search: t.Optional(t.String()),
  sort: t.Optional(t.UnionEnum(["createdAt", "name", "id"])),
  order: t.Optional(t.UnionEnum(["asc", "desc"])),
})

export const projects = baseApp("projects").group("/projects", (app) =>
  app
    .use(authGuard())
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
      async ({ db, query }) => {
        const { page = 1, limit = 10, search, sort, order } = query

        const whereList = []
        if (search) {
          whereList.push(ilike(schema.projects.name, `%${search}%`))
        }

        const allProjects = await db.query.projects.findMany({
          orderBy: (projects, { desc, asc }) => {
            const sortField =
              sort === "createdAt"
                ? projects.createdAt
                : sort === "name"
                ? projects.name
                : projects.id

            return [order === "asc" ? asc(sortField) : desc(sortField)]
          },
          where: and(...whereList),
          limit,
          offset: (page - 1) * limit,
        })

        const total = await db
          .select({ count: count() })
          .from(schema.projects)
          .where(and(...whereList))

        return {
          projects: allProjects,
          total: total[0]?.count ?? 0,
        }
      },
      {
        detail: {
          summary: "Get all projects",
          tags: ["Projects"],
        },
        query: querySchema,
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
          id: t.String({
            format: "uuid",
          }),
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
            })
            .where(eq(schema.projects.id, projectId))
            .returning() // Return the updated project

          if (!updatedProject || updatedProject.length === 0) {
            return error(500, "Failed to update project")
          }

          return updatedProject[0]
        } catch (e) {
          console.error(`Failed to update project ${projectId}:`, e)
          return error(500, "Internal Server Error")
        }
      },
      {
        params: t.Object({
          id: t.String({
            format: "uuid",
          }),
        }),
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1 })),
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
          return error(500, "Internal Server Error")
        }
      },
      {
        params: t.Object({
          id: t.String({
            format: "uuid",
          }),
        }),
        detail: {
          summary: "Delete a project by ID",
          tags: ["Projects"],
        },
      }
    )
)
