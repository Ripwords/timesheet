import { baseApp } from "../../utils/baseApp"
import * as schema from "../db/schema"
import { t } from "elysia"
import { and, count, eq, ilike } from "drizzle-orm"
import { authGuard } from "../middleware/authGuard"
import { error as logError } from "@rasla/logify"
const querySchema = t.Object({
  page: t.Optional(t.Number({ default: 1 })),
  limit: t.Optional(t.Number({ default: 10 })),
  search: t.Optional(t.String()),
  sort: t.Optional(t.UnionEnum(["createdAt", "name", "id"])),
  order: t.Optional(t.UnionEnum(["asc", "desc"])),
  isActive: t.Optional(t.Boolean({ default: true })),
})

export const projects = baseApp("projects").group("/projects", (app) =>
  app
    .use(authGuard())
    .post(
      "/",
      async ({ db, body, status, isAdmin }) => {
        if (!isAdmin) {
          return status(403, "Forbidden")
        }

        try {
          const newProject = await db
            .insert(schema.projects)
            .values({
              name: body.name,
            })
            .returning() // Return the newly created project

          if (!newProject || newProject.length === 0) {
            return status(500, "Failed to create project")
          }

          return newProject[0]
        } catch (e) {
          logError(`Failed to create project: ${e}`)
          return status(500, "Internal Server Error")
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
        adminOnly: true,
      }
    )
    // READ All Projects
    .get(
      "/",
      async ({ db, query }) => {
        const {
          page = 1,
          limit = 10,
          search,
          sort,
          order,
          isActive = true,
        } = query
        console.log("query", query)
        const whereList = []
        if (search) {
          whereList.push(ilike(schema.projects.name, `%${search}%`))
        }
        // Filter by isActive status
        whereList.push(eq(schema.projects.isActive, isActive))

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
          limit: limit > 0 ? limit : undefined,
          offset: limit > 0 ? (page - 1) * limit : undefined,
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
          where: and(
            eq(schema.projects.id, projectId),
            eq(schema.projects.isActive, true)
          ),
          columns: { id: true, name: true, isActive: true },
        })

        if (!project) {
          return error(404, "Project not found")
        }
        return project
      },
      {
        params: t.Object({
          id: t.String({ format: "uuid" }),
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
      async ({ db, params, body, status, isAdmin }) => {
        if (!isAdmin) {
          return status(403, "Forbidden")
        }

        const projectId = params.id

        // Check if project exists first
        const existingProject = await db.query.projects.findFirst({
          where: eq(schema.projects.id, projectId),
          columns: { id: true }, // Only fetch id for existence check
        })

        if (!existingProject) {
          return status(404, "Project not found")
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
            return status(500, "Failed to update project")
          }

          return updatedProject[0]
        } catch (e) {
          logError(`Failed to update project ${projectId}: ${e}`)
          return status(500, "Internal Server Error")
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
        adminOnly: true,
      }
    )
    // DELETE Project (Soft Delete)
    .delete(
      "/id/:id",
      async ({ db, params, status, set, isAdmin }) => {
        if (!isAdmin) {
          return status(403, "Forbidden")
        }

        const projectId = params.id

        try {
          // Check if project exists and is currently active
          const existingProject = await db.query.projects.findFirst({
            where: eq(schema.projects.id, projectId),
            columns: { id: true, isActive: true },
          })

          if (!existingProject) {
            return status(404, "Project not found")
          }

          if (!existingProject.isActive) {
            return status(400, "Project is already inactive")
          }

          // Soft delete: set isActive to false
          const updatedProject = await db
            .update(schema.projects)
            .set({
              isActive: false,
              updatedAt: new Date(),
            })
            .where(eq(schema.projects.id, projectId))
            .returning({
              id: schema.projects.id,
              isActive: schema.projects.isActive,
            })

          if (!updatedProject || updatedProject.length === 0) {
            return status(500, "Failed to deactivate project")
          }

          set.status = 200
          return { message: `Project ${projectId} deactivated successfully` }
        } catch (e) {
          logError(`Failed to deactivate project ${projectId}: ${e}`)
          return status(500, "Internal Server Error")
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
        adminOnly: true,
      }
    )
    // ACTIVATE Project
    .patch(
      "/id/:id/activate",
      async ({ db, params, status, isAdmin }) => {
        if (!isAdmin) {
          return status(403, "Forbidden")
        }

        const projectId = params.id

        try {
          // Check if project exists
          const existingProject = await db.query.projects.findFirst({
            where: eq(schema.projects.id, projectId),
            columns: { id: true, isActive: true },
          })

          if (!existingProject) {
            return status(404, "Project not found")
          }

          if (existingProject.isActive) {
            return status(400, "Project is already active")
          }

          // Reactivate: set isActive to true
          const updatedProject = await db
            .update(schema.projects)
            .set({
              isActive: true,
              updatedAt: new Date(),
            })
            .where(eq(schema.projects.id, projectId))
            .returning({
              id: schema.projects.id,
              isActive: schema.projects.isActive,
            })

          if (!updatedProject || updatedProject.length === 0) {
            return status(500, "Failed to activate project")
          }

          return {
            message: `Project ${projectId} activated successfully`,
            project: updatedProject[0],
          }
        } catch (e) {
          logError(`Failed to activate project ${projectId}: ${e}`)
          return status(500, "Internal Server Error")
        }
      },
      {
        params: t.Object({
          id: t.String({
            format: "uuid",
          }),
        }),
        detail: {
          summary: "Activate a project by ID",
          tags: ["Projects"],
        },
        adminOnly: true,
      }
    )
)
