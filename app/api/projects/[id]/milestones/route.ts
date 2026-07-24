import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, milestones, projects } from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredIsoDate,
  requiredString,
  safeNumber,
} from "@/lib/api-utils";
import { recalculateProjectHealth } from "@/lib/health";
import { ensureSeeded } from "@/lib/seed";
import {
  lifecycleLockedResponse,
  projectLifecycleLocked,
} from "@/lib/project-lifecycle";
import {
  canWriteProject,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type MilestoneUpdate = {
  id?: number;
  name?: string;
  sequence?: number;
  weight?: number;
  critical?: boolean;
  applicable?: boolean;
};

async function getProject(projectId: string) {
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const { id } = await context.params;
    const project = await getProject(id);
    if (!project) {
      return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    }
    const rows = await getDb()
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, id))
      .orderBy(asc(milestones.sequence));
    return Response.json({ milestones: rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const { id } = await context.params;
    const project = await getProject(id);
    if (!project) {
      return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    }
    if (!canWriteProject(identity, project.ownerEmail)) return forbidden();
    if (projectLifecycleLocked(project)) return lifecycleLockedResponse(project);
    const payload = (await request.json()) as { milestones?: MilestoneUpdate[] };
    if (!Array.isArray(payload.milestones) || payload.milestones.length < 2) {
      throw new ApiRequestError("项目至少需要保留两个节点。");
    }
    const parsed = payload.milestones.map((row, index) => {
      const milestoneId = safeNumber(row.id, `第${index + 1}个节点编号`, 1, 1_000_000);
      const sequence = safeNumber(row.sequence, `第${index + 1}个节点序号`, 1, 99);
      if (!Number.isInteger(milestoneId) || !Number.isInteger(sequence)) {
        throw new ApiRequestError("节点编号和序号必须是整数。");
      }
      return {
        id: milestoneId,
        name: requiredString(row.name, `第${index + 1}个节点名称`),
        sequence,
        weight: safeNumber(row.weight, `第${index + 1}个节点权重`, 0, 100),
        critical: Boolean(row.critical),
        applicable: row.applicable !== false,
      };
    });
    if (
      new Set(parsed.map((row) => row.id)).size !== parsed.length ||
      new Set(parsed.map((row) => row.sequence)).size !== parsed.length
    ) {
      throw new ApiRequestError("节点编号或序号不能重复。");
    }
    if (parsed.filter((row) => row.applicable).length < 2) {
      throw new ApiRequestError("至少需要保留两个适用节点。");
    }
    const totalWeight = parsed.reduce((sum, row) => sum + row.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new ApiRequestError(
        `项目节点权重合计必须为100%，当前为${totalWeight.toFixed(1)}%。`,
      );
    }
    const db = getDb();
    const existing = await db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, id));
    if (
      existing.length !== parsed.length ||
      parsed.some((row) => !existing.some((item) => item.id === row.id))
    ) {
      return Response.json(
        { error: "项目节点已被其他用户调整，请刷新后重试。" },
        { status: 409 },
      );
    }
    await db.batch([
      ...parsed.map((row) =>
        db
          .update(milestones)
          .set({
            name: row.name,
            sequence: row.sequence + 1000,
            weight: row.weight,
            critical: row.critical,
            applicable: row.applicable,
            status: row.applicable ? "green" : "na",
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(milestones.id, row.id)),
      ),
      ...parsed.map((row) =>
        db
          .update(milestones)
          .set({
            sequence: row.sequence,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(milestones.id, row.id)),
      ),
      db.insert(auditLogs).values({
        actorEmail: identity.email,
        action: "project_milestones.update",
        entityType: "project",
        entityId: id,
        detailJson: JSON.stringify({
          milestoneCount: parsed.length,
          applicableCount: parsed.filter((row) => row.applicable).length,
          totalWeight,
        }),
      }),
    ]);
    const health = await recalculateProjectHealth(id);
    const rows = await db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, id))
      .orderBy(asc(milestones.sequence));
    return Response.json({ milestones: rows, health });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json(
        { error: "节点序号已经存在，请刷新后重试。" },
        { status: 409 },
      );
    }
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const { id } = await context.params;
    const project = await getProject(id);
    if (!project) {
      return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    }
    if (!canWriteProject(identity, project.ownerEmail)) return forbidden();
    if (projectLifecycleLocked(project)) return lifecycleLockedResponse(project);
    const payload = (await request.json()) as {
      name?: string;
      sequence?: number;
      critical?: boolean;
      plannedStart?: string;
      plannedFinish?: string;
    };
    const sequence = safeNumber(payload.sequence, "节点序号", 1, 99);
    if (!Number.isInteger(sequence)) {
      throw new ApiRequestError("节点序号必须是整数。");
    }
    const plannedStart = requiredIsoDate(payload.plannedStart, "计划开始日");
    const plannedFinish = requiredIsoDate(payload.plannedFinish, "计划完成日");
    if (plannedFinish < plannedStart) {
      throw new ApiRequestError("计划完成日不能早于计划开始日。");
    }
    const db = getDb();
    const [row] = await db
      .insert(milestones)
      .values({
        projectId: id,
        name: requiredString(payload.name, "节点名称"),
        sequence,
        weight: 0,
        critical: Boolean(payload.critical),
        custom: true,
        applicable: true,
        plannedStart,
        plannedFinish,
        forecastFinish: plannedFinish,
      })
      .returning();
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "project_milestone.create_custom",
      entityType: "milestone",
      entityId: String(row.id),
      detailJson: JSON.stringify({ projectId: id, name: row.name, sequence }),
    });
    return Response.json(
      {
        milestone: row,
        note: "自定义节点默认权重为0；如需纳入进度计算，请在节点治理中重新分配权重并确保合计100%。",
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json(
        { error: "该项目的节点序号已经存在。" },
        { status: 409 },
      );
    }
    return apiError(error);
  }
}
