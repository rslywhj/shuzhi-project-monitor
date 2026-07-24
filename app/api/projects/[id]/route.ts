import { and, eq, exists, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, projects, users } from "@/db/schema";
import { ApiRequestError, apiError } from "@/lib/api-utils";
import { requireProjectOwnerAccount } from "@/lib/project-owner";
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
      payload.ownerName !== undefined &&
      payload.ownerEmail === undefined
    ) {
      throw new ApiRequestError(
        "调整项目负责人时必须从账号目录重新选择项目经理。",
      );
    }
    if (
      payload.riskLevel &&
      !["low", "medium", "high"].includes(payload.riskLevel)
    ) {
      throw new ApiRequestError("风险等级无效。");
    }
    const ownerAccount =
      payload.ownerEmail !== undefined
        ? await requireProjectOwnerAccount(db, payload.ownerEmail)
        : null;
    const changes = {
      ...(payload.name?.trim() ? { name: payload.name.trim() } : {}),
      ...(ownerAccount
        ? {
            ownerEmail: ownerAccount.email,
            ownerName: ownerAccount.displayName,
          }
        : {}),
      ...(payload.org?.trim() ? { org: payload.org.trim() } : {}),
      ...(payload.type?.trim() ? { type: payload.type.trim() } : {}),
      ...(payload.riskLevel ? { riskLevel: payload.riskLevel } : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    };
    const ownerStillEligible = ownerAccount
      ? exists(
          db
            .select({ value: sql`1` })
            .from(users)
            .where(
              and(
                eq(users.email, ownerAccount.email),
                eq(users.active, true),
                eq(users.role, "manager"),
              ),
            ),
        )
      : undefined;
    const [project] = await db
      .update(projects)
      .set(changes)
      .where(
        ownerStillEligible
          ? and(eq(projects.id, id), ownerStillEligible)
          : eq(projects.id, id),
      )
      .returning();
    if (!project) {
      throw new ApiRequestError(
        "项目经理账号状态已发生变化，请刷新账号目录后重新选择。",
        409,
      );
    }
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: ownerAccount ? "project.owner_transfer" : "project.update",
      entityType: "project",
      entityId: id,
      detailJson: JSON.stringify(
        ownerAccount
          ? {
              ...payload,
              previousOwnerEmail: existing.ownerEmail,
              previousOwnerName: existing.ownerName,
              ownerEmail: ownerAccount.email,
              ownerName: ownerAccount.displayName,
            }
          : payload,
      ),
    });
    return Response.json({ project });
  } catch (error) {
    return apiError(error);
  }
}
