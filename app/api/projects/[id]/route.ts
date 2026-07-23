import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, projects } from "@/db/schema";
import { ApiRequestError, apiError, requiredEmail } from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import {
  canWriteProject,
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type ProjectPatch = {
  name?: string;
  ownerEmail?: string;
  ownerName?: string;
  org?: string;
  type?: string;
  riskLevel?: "low" | "medium" | "high";
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();

    const { id } = await context.params;
    const db = getDb();
    const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!existing) {
      return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    }
    if (!canWriteProject(identity, existing.ownerEmail)) return forbidden();

    const payload = (await request.json()) as ProjectPatch;
    if (
      (payload.ownerEmail !== undefined || payload.ownerName !== undefined) &&
      !canManagePortfolio(identity)
    ) {
      return Response.json(
        { error: "只有 PMO 或系统管理员可以调整项目负责人。" },
        { status: 403 },
      );
    }
    if (
      payload.riskLevel &&
      !["low", "medium", "high"].includes(payload.riskLevel)
    ) {
      throw new ApiRequestError("风险等级无效。");
    }
    const changes = {
      ...(payload.name?.trim() ? { name: payload.name.trim() } : {}),
      ...(payload.ownerEmail?.trim()
        ? { ownerEmail: requiredEmail(payload.ownerEmail, "项目经理邮箱") }
        : {}),
      ...(payload.ownerName?.trim() ? { ownerName: payload.ownerName.trim() } : {}),
      ...(payload.org?.trim() ? { org: payload.org.trim() } : {}),
      ...(payload.type?.trim() ? { type: payload.type.trim() } : {}),
      ...(payload.riskLevel ? { riskLevel: payload.riskLevel } : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    };
    const [project] = await db
      .update(projects)
      .set(changes)
      .where(eq(projects.id, id))
      .returning();
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "project.update",
      entityType: "project",
      entityId: id,
      detailJson: JSON.stringify(payload),
    });
    return Response.json({ project });
  } catch (error) {
    return apiError(error);
  }
}
