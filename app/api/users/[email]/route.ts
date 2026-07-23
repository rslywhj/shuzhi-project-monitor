import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import {
  canAdministerUsers,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const roles = new Set(["executive", "pmo", "manager", "admin"]);

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
    };
    if (payload.role && !roles.has(payload.role)) {
      return Response.json({ error: "无效的用户角色。" }, { status: 400 });
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
    const [user] = await db
      .update(users)
      .set({
        ...(payload.role ? { role: payload.role } : {}),
        ...(typeof payload.active === "boolean" ? { active: payload.active } : {}),
      })
      .where(eq(users.email, email))
      .returning();
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "user.update",
      entityType: "user",
      entityId: email,
      detailJson: JSON.stringify(payload),
    });
    return Response.json({ user });
  } catch (error) {
    return apiError(error);
  }
}
