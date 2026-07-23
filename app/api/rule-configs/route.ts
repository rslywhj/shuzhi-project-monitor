import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, ruleConfigs } from "@/db/schema";
import { apiError, safeNumber } from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
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
    const [latest] = await db
      .select()
      .from(ruleConfigs)
      .orderBy(desc(ruleConfigs.version))
      .limit(1);
    await db.update(ruleConfigs).set({ active: false }).where(eq(ruleConfigs.active, true));
    const [rule] = await db
      .insert(ruleConfigs)
      .values({
        ...values,
        version: (latest?.version ?? 0) + 1,
        createdBy: identity.email,
        createdAt: sql`CURRENT_TIMESTAMP`,
      })
      .returning();
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "rule_config.publish",
      entityType: "rule_config",
      entityId: String(rule.id),
      detailJson: JSON.stringify(values),
    });
    return Response.json({ rule });
  } catch (error) {
    return apiError(error);
  }
}
