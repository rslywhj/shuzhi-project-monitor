import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, projects, users } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import {
  canAdministerUsers,
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";
import { hashPassword } from "@/lib/password-auth";
import {
  getPasswordPolicy,
  validatePassword,
} from "@/lib/password-policy";

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

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    const db = getDb();
    const [rows, projectRows] = await Promise.all([
      db.select().from(users).orderBy(asc(users.displayName)),
      db.select({ ownerEmail: projects.ownerEmail }).from(projects),
    ]);
    const assignedCounts = new Map<string, number>();
    for (const project of projectRows) {
      assignedCounts.set(
        project.ownerEmail,
        (assignedCounts.get(project.ownerEmail) ?? 0) + 1,
      );
    }
    return Response.json({
      users: rows.map((user) => ({
        ...publicUser(user),
        assignedProjectCount: assignedCounts.get(user.email) ?? 0,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canAdministerUsers(identity)) return forbidden();

    const payload = (await request.json()) as {
      email?: unknown;
      displayName?: unknown;
      role?: unknown;
      password?: unknown;
    };
    const email =
      typeof payload.email === "string"
        ? payload.email.trim().toLowerCase()
        : "";
    const displayName =
      typeof payload.displayName === "string"
        ? payload.displayName.trim()
        : "";
    const role =
      typeof payload.role === "string" && roles.has(payload.role)
        ? (payload.role as "executive" | "pmo" | "manager" | "admin")
        : null;
    const password =
      typeof payload.password === "string" ? payload.password : "";
    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return Response.json({ error: "请输入有效的用户邮箱。" }, { status: 400 });
    }
    if (displayName.length < 2 || displayName.length > 60) {
      return Response.json(
        { error: "用户姓名长度必须为2–60个字符。" },
        { status: 400 },
      );
    }
    if (!role) {
      return Response.json({ error: "请选择有效的用户角色。" }, { status: 400 });
    }
    const passwordPolicy = await getPasswordPolicy();
    const passwordError = validatePassword(password, passwordPolicy);
    if (passwordError) {
      return Response.json({ error: passwordError }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) {
      return Response.json({ error: "该邮箱已存在，无需重复预置。" }, { status: 409 });
    }

    const credentials = await hashPassword(password, passwordPolicy);
    await db.batch([
      db
        .insert(users)
        .values({ email, displayName, role, active: true, ...credentials }),
      db.insert(auditLogs).values({
        actorEmail: identity.email,
        action: "user.create",
        entityType: "user",
        entityId: email,
        detailJson: JSON.stringify({ displayName, role, active: true }),
      }),
    ]);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return Response.json(
      { user: user ? publicUser(user) : null },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json({ error: "该邮箱已存在，无需重复预置。" }, { status: 409 });
    }
    return apiError(error);
  }
}
