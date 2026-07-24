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
      progressYellowGap?: number;
      progressRedGap?: number;
      progressYellowPenalty?: number;
      progressRedPenalty?: number;
      normalYellowPenalty?: number;
      normalRedPenalty?: number;
      criticalYellowPenalty?: number;
      criticalRedPenalty?: number;
      schedulePenaltyCap?: number;
      mediumRiskPenalty?: number;
      highRiskPenalty?: number;
      riskPenaltyCap?: number;
      overdueActionPenalty?: number;
      actionPenaltyCap?: number;
      missingReportPenalty?: number;
      consecutiveMissingPenalty?: number;
      vetoCriticalRed?: boolean;
      vetoHighRiskOverdue?: boolean;
      vetoConsecutiveMissing?: boolean;
    };
    const values = {
      normalYellowDays: safeNumber(payload.normalYellowDays, "普通节点黄色阈值", 0, 365),
      normalRedDays: safeNumber(payload.normalRedDays, "普通节点红色阈值", 1, 365),
      criticalYellowDays: safeNumber(payload.criticalYellowDays, "关键节点黄色阈值", 0, 365),
      criticalRedDays: safeNumber(payload.criticalRedDays, "关键节点红色阈值", 1, 365),
      greenScore: safeNumber(payload.greenScore, "绿色评分阈值", 1, 100),
      yellowScore: safeNumber(payload.yellowScore, "黄色评分阈值", 0, 99),
      progressYellowGap: safeNumber(payload.progressYellowGap, "进度黄色差值", 1, 100),
      progressRedGap: safeNumber(payload.progressRedGap, "进度红色差值", 2, 100),
      progressYellowPenalty: safeNumber(payload.progressYellowPenalty, "进度黄色扣分", 0, 100),
      progressRedPenalty: safeNumber(payload.progressRedPenalty, "进度红色扣分", 0, 100),
      normalYellowPenalty: safeNumber(payload.normalYellowPenalty, "普通黄色节点扣分", 0, 100),
      normalRedPenalty: safeNumber(payload.normalRedPenalty, "普通红色节点扣分", 0, 100),
      criticalYellowPenalty: safeNumber(payload.criticalYellowPenalty, "关键黄色节点扣分", 0, 100),
      criticalRedPenalty: safeNumber(payload.criticalRedPenalty, "关键红色节点扣分", 0, 100),
      schedulePenaltyCap: safeNumber(payload.schedulePenaltyCap, "进度类扣分上限", 0, 100),
      mediumRiskPenalty: safeNumber(payload.mediumRiskPenalty, "中风险扣分", 0, 100),
      highRiskPenalty: safeNumber(payload.highRiskPenalty, "高风险扣分", 0, 100),
      riskPenaltyCap: safeNumber(payload.riskPenaltyCap, "风险扣分上限", 0, 100),
      overdueActionPenalty: safeNumber(payload.overdueActionPenalty, "逾期措施扣分", 0, 100),
      actionPenaltyCap: safeNumber(payload.actionPenaltyCap, "措施扣分上限", 0, 100),
      missingReportPenalty: safeNumber(payload.missingReportPenalty, "周报缺报扣分", 0, 100),
      consecutiveMissingPenalty: safeNumber(payload.consecutiveMissingPenalty, "连续缺报扣分", 0, 100),
      vetoCriticalRed: payload.vetoCriticalRed !== false,
      vetoHighRiskOverdue: payload.vetoHighRiskOverdue !== false,
      vetoConsecutiveMissing: payload.vetoConsecutiveMissing !== false,
    };
    if (
      values.normalYellowDays >= values.normalRedDays ||
      values.criticalYellowDays >= values.criticalRedDays ||
      values.yellowScore >= values.greenScore ||
      values.progressYellowGap >= values.progressRedGap ||
      values.progressYellowPenalty > values.progressRedPenalty ||
      values.normalYellowPenalty > values.normalRedPenalty ||
      values.criticalYellowPenalty > values.criticalRedPenalty ||
      values.mediumRiskPenalty > values.highRiskPenalty ||
      values.missingReportPenalty > values.consecutiveMissingPenalty
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
            progress_yellow_gap,
            progress_red_gap,
            progress_yellow_penalty,
            progress_red_penalty,
            normal_yellow_penalty,
            normal_red_penalty,
            critical_yellow_penalty,
            critical_red_penalty,
            schedule_penalty_cap,
            medium_risk_penalty,
            high_risk_penalty,
            risk_penalty_cap,
            overdue_action_penalty,
            action_penalty_cap,
            missing_report_penalty,
            consecutive_missing_penalty,
            veto_critical_red,
            veto_high_risk_overdue,
            veto_consecutive_missing,
            active,
            created_by,
            created_at
          )
          SELECT
            COALESCE(MAX(version), 0) + 1,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            1, ?, ?
          FROM rule_configs`,
        )
        .bind(
          values.normalYellowDays,
          values.normalRedDays,
          values.criticalYellowDays,
          values.criticalRedDays,
          values.greenScore,
          values.yellowScore,
          values.progressYellowGap,
          values.progressRedGap,
          values.progressYellowPenalty,
          values.progressRedPenalty,
          values.normalYellowPenalty,
          values.normalRedPenalty,
          values.criticalYellowPenalty,
          values.criticalRedPenalty,
          values.schedulePenaltyCap,
          values.mediumRiskPenalty,
          values.highRiskPenalty,
          values.riskPenaltyCap,
          values.overdueActionPenalty,
          values.actionPenaltyCap,
          values.missingReportPenalty,
          values.consecutiveMissingPenalty,
          values.vetoCriticalRed ? 1 : 0,
          values.vetoHighRiskOverdue ? 1 : 0,
          values.vetoConsecutiveMissing ? 1 : 0,
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
