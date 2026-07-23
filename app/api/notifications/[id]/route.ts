import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { ApiRequestError, apiError } from "@/lib/api-utils";
import { getRequestIdentity, unauthorized } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const { id: value } = await context.params;
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) {
      throw new ApiRequestError("通知编号无效。");
    }
    const payload = (await request.json()) as { status?: "read" | "dismissed" };
    if (payload.status !== "read" && payload.status !== "dismissed") {
      return Response.json({ error: "通知状态无效。" }, { status: 400 });
    }
    const [notification] = await getDb()
      .update(notifications)
      .set({
        status: payload.status,
        readAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.recipientEmail, identity.email),
        ),
      )
      .returning();
    if (!notification) {
      return Response.json({ error: "未找到指定通知。" }, { status: 404 });
    }
    return Response.json({ notification });
  } catch (error) {
    return apiError(error);
  }
}
