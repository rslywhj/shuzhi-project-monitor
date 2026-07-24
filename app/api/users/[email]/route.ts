import { and, eq, notExists } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, projects, users } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import {
  canAdministerUsers,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";
import { hashPassword, validatePassword } from "@/lib/password-auth";

export const dynamic = "force-dynamic";

const roles = new Set(["executive", "pmo", "manager", "admin"]);

function publicUser(user: typeof users.$inferSelect) {
  return {
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    passwordConfigured: Boolean(user.passwordHash),
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ email: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canAdministerUsers(identity)) return forbidden();

    const { email: encodedEmail } = await context.params;
    const email = decodeURIComponent(encodedEmail).trim().toLowerCase();
    const payload = (await request.json()) as {
      role?: "executive" | "pmo" | "manager" | "admin";
      active?: boolean;
      password?: unknown;
    };
    if (payload.role && !roles.has(payload.role)) {
      return Response.json({ error: "无效的用户角色。" }, { status: 400 });
    }
    const password =
      typeof payload.password === "string" ? payload.password : "";
    if (password) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        return Response.json({ error: passwordError }, { status: 400 });
      }
    }
    if (
      identity.email === email &&
      (payload.active === false || (payload.role && payload.role !== "admin"))
    ) {
      return Response.json(
        { error: "不能停用或降级当前登录的管理员账号。" },
        { status: 409 },
      );
    }

    const db = getDb();
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!existing) {
      return Response.json({ error: "未找到指定用户。" }, { status: 404 });
    }
    const resultingRole = payload.role ?? existing.role;
    const resultingActive =
      typeof payload.active === "boolean" ? payload.active : existing.active;
    const invalidatesProjectOwnership =
      !resultingActive || resultingRole !== "manager";
    if (invalidatesProjectOwnership) {
      const assignedProjects = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.ownerEmail, email));
      if (assignedProjects.length) {
        const examples = assignedProjects
          .slice(0, 3)
          .map((project) => `${project.id} ${project.name}`)
          .join("、");
        return Response.json(
          {
            error: `该账号仍负责${assignedProjects.length}个项目（${examples}${assignedProjects.length > 3 ? "等" : ""}），请先完成项目移交。`,
          },
          { status: 409 },
        );
      }
    }
    const credentials = password ? await hashPassword(password) : {};
    const updateValues = {
      ...(payload.role ? { role: payload.role } : {}),
      ...(typeof payload.active === "boolean"
        ? { active: payload.active }
        : {}),
      ...credentials,
    };
    const auditPayload = {
      ...(payload.role ? { role: payload.role } : {}),
      ...(typeof payload.active === "boolean"
        ? { active: payload.active }
        : {}),
      passwordReset: Boolean(password),
    };
    if (invalidatesProjectOwnership) {
      const [updated] = await db
        .update(users)
        .set(updateValues)
        .where(
          and(
            eq(users.email, email),
            notExists(
              db
                .select({ id: projects.id })
                .from(projects)
                .where(eq(projects.ownerEmail, email)),
            ),
          ),
        )
        .returning({ email: users.email });
      if (!updated) {
        return Response.json(
          { error: "该账号刚刚被分配了项目，请先完成项目移交。" },
          { status: 409 },
        );
      }
      await db.insert(auditLogs).values({
        actorEmail: identity.email,
        action: "user.update",
        entityType: "user",
        entityId: email,
        detailJson: JSON.stringify({
          ...auditPayload,
          previousRole: existing.role,
          previousActive: existing.active,
        }),
      });
    } else {
      await db.batch([
        db.update(users).set(updateValues).where(eq(users.email, email)),
        db.insert(auditLogs).values({
          actorEmail: identity.email,
          action: "user.update",
          entityType: "user",
          entityId: email,
          detailJson: JSON.stringify({
            ...auditPayload,
            previousRole: existing.role,
            previousActive: existing.active,
          }),
        }),
      ]);
    }
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return Response.json({ user: user ? publicUser(user) : null });
  } catch (error) {
    return apiError(error);
  }
}
