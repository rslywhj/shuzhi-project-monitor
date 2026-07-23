import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import { getRequestIdentity, unauthorized } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const db = getDb();
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientEmail, identity.email))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(100);
    return Response.json({
      notifications: rows,
      unreadCount: rows.filter((row) => row.status === "unread").length,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const payload = (await request.json()) as { status?: "read" | "dismissed" };
    if (payload.status !== "read" && payload.status !== "dismissed") {
      return Response.json({ error: "通知状态无效。" }, { status: 400 });
    }
    const db = getDb();
    const rows = await db
      .update(notifications)
      .set({
        status: payload.status,
        readAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(
        and(
          eq(notifications.recipientEmail, identity.email),
          eq(notifications.status, "unread"),
        ),
      )
      .returning({ id: notifications.id });
    return Response.json({ updated: rows.length });
  } catch (error) {
    return apiError(error);
  }
}
