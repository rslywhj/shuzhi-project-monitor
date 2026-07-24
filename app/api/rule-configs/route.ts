import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, projects, ruleConfigs } from "@/db/schema";
import { apiError, safeNumber } from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import { recalculateProjectHealth } from "@/lib/health";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const rows = await getDb()
      .select()
      .from(ruleConfigs)
      .orderBy(desc(ruleConfigs.version))
      .limit(20);
    return Response.json({ ruleConfigs: rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    await ensureSeeded();

    const payload = (await request.json()) as {
      normalYellowDays?: number;
      normalRedDays?: number;
      criticalYellowDays?: number;
      criticalRedDays?: number;
      greenScore?: number;
      yellowScore?: number;
    };
    const values = {
      normalYellowDays: safeNumber(payload.normalYellowDays, "普通节点黄色阈值", 0, 365),
      normalRedDays: safeNumber(payload.normalRedDays, "普通节点红色阈值", 1, 365),
      criticalYellowDays: safeNumber(payload.criticalYellowDays, "关键节点黄色阈值", 0, 365),
      criticalRedDays: safeNumber(payload.criticalRedDays, "关键节点红色阈值", 1, 365),
      greenScore: safeNumber(payload.greenScore, "绿色评分阈值", 1, 100),
      yellowScore: safeNumber(payload.yellowScore, "黄色评分阈值", 0, 99),
    };
    if (
      values.normalYellowDays >= values.normalRedDays ||
      values.criticalYellowDays >= values.criticalRedDays ||
      values.yellowScore >= values.greenScore
    ) {
      return Response.json(
        { error: "红黄阈值或评分区间的顺序不正确。" },
        { status: 400 },
      );
    }

    const db = getDb();
    const createdAt = new Date().toISOString();
    await db.$client.batch([
      db.$client.prepare("UPDATE rule_configs SET active = 0 WHERE active = 1"),
      db.$client
        .prepare(
          `INSERT INTO rule_configs (
            version,
            normal_yellow_days,
            normal_red_days,
            critical_yellow_days,
            critical_red_days,
            green_score,
            yellow_score,
            active,
            created_by,
            created_at
          )
          SELECT
            COALESCE(MAX(version), 0) + 1,
            ?, ?, ?, ?, ?, ?, 1, ?, ?
          FROM rule_configs`,
        )
        .bind(
          values.normalYellowDays,
          values.normalRedDays,
          values.criticalYellowDays,
          values.criticalRedDays,
          values.greenScore,
          values.yellowScore,
          identity.email,
          createdAt,
        ),
    ]);
    const [rule] = await db
      .select()
      .from(ruleConfigs)
      .where(eq(ruleConfigs.createdAt, createdAt))
      .orderBy(desc(ruleConfigs.version))
      .limit(1);
    if (!rule) {
      throw new Error("Published rule config could not be reloaded.");
    }
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "rule_config.publish",
      entityType: "rule_config",
      entityId: String(rule.id),
      detailJson: JSON.stringify(values),
    });
    const projectRows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.lifecycleStatus, "active"));
    for (let index = 0; index < projectRows.length; index += 5) {
      await Promise.all(
        projectRows
          .slice(index, index + 5)
          .map((project) =>
            recalculateProjectHealth(project.id, undefined, {
              touchProject: false,
            }),
          ),
      );
    }
    return Response.json({ rule, recalculatedProjects: projectRows.length });
  } catch (error) {
    return apiError(error);
  }
}
