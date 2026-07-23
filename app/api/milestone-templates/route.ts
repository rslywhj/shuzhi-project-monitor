import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, milestoneTemplates } from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredString,
  safeNumber,
} from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type TemplateInput = {
  id?: number;
  code?: string;
  name?: string;
  sequence?: number;
  defaultWeight?: number;
  critical?: boolean;
  active?: boolean;
  description?: string;
};

function parseTemplate(input: TemplateInput, index: number) {
  const sequence = safeNumber(input.sequence, `第${index + 1}个节点序号`, 1, 99);
  if (!Number.isInteger(sequence)) {
    throw new ApiRequestError("节点序号必须是整数。");
  }
  const code = requiredString(input.code, `第${index + 1}个节点编码`).toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]{1,19}$/.test(code)) {
    throw new ApiRequestError("节点编码必须以字母开头，并包含2–20位字母、数字、下划线或连字符。");
  }
  return {
    id: input.id,
    code,
    name: requiredString(input.name, `第${index + 1}个节点名称`),
    sequence,
    defaultWeight: safeNumber(
      input.defaultWeight,
      `第${index + 1}个节点默认权重`,
      0,
      100,
    ),
    critical: Boolean(input.critical),
    active: input.active !== false,
    description: input.description?.trim() ?? "",
  };
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const rows = await getDb()
      .select()
      .from(milestoneTemplates)
      .orderBy(asc(milestoneTemplates.sequence));
    return Response.json({ milestoneTemplates: rows });
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
    const payload = (await request.json()) as { templates?: TemplateInput[] };
    if (!Array.isArray(payload.templates) || payload.templates.length < 2) {
      throw new ApiRequestError("节点模板至少需要包含两个节点。");
    }
    const parsed = payload.templates.map(parseTemplate);
    const ids = parsed.map((row) => row.id);
    if (
      ids.some((id) => !Number.isInteger(id)) ||
      new Set(ids).size !== parsed.length
    ) {
      throw new ApiRequestError("节点模板编号缺失或重复。");
    }
    if (
      new Set(parsed.map((row) => row.code)).size !== parsed.length ||
      new Set(parsed.map((row) => row.sequence)).size !== parsed.length
    ) {
      throw new ApiRequestError("节点编码和序号不能重复。");
    }
    const activeRows = parsed.filter((row) => row.active);
    const totalWeight = activeRows.reduce(
      (sum, row) => sum + row.defaultWeight,
      0,
    );
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new ApiRequestError(
        `启用节点的默认权重合计必须为100%，当前为${totalWeight.toFixed(1)}%。`,
      );
    }

    const db = getDb();
    const existing = await db.select().from(milestoneTemplates);
    if (
      existing.length !== parsed.length ||
      parsed.some((row) => !existing.some((item) => item.id === row.id))
    ) {
      return Response.json(
        { error: "节点模板已被其他用户调整，请刷新后重试。" },
        { status: 409 },
      );
    }
    await db.batch([
      ...parsed.map((row) =>
        db
          .update(milestoneTemplates)
          .set({
            code: `__TMP_${row.id}`,
            name: row.name,
            sequence: row.sequence + 1000,
            defaultWeight: row.defaultWeight,
            critical: row.critical,
            active: row.active,
            description: row.description,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(milestoneTemplates.id, row.id!)),
      ),
      ...parsed.map((row) =>
        db
          .update(milestoneTemplates)
          .set({
            code: row.code,
            sequence: row.sequence,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(milestoneTemplates.id, row.id!)),
      ),
      db.insert(auditLogs).values({
        actorEmail: identity.email,
        action: "milestone_template.publish",
        entityType: "milestone_template",
        entityId: "standard",
        detailJson: JSON.stringify({
          count: parsed.length,
          activeCount: activeRows.length,
          totalWeight,
        }),
      }),
    ]);
    const rows = await db
      .select()
      .from(milestoneTemplates)
      .orderBy(asc(milestoneTemplates.sequence));
    return Response.json({ milestoneTemplates: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json(
        { error: "节点编码或序号已被占用，请刷新后重试。" },
        { status: 409 },
      );
    }
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    await ensureSeeded();
    const input = (await request.json()) as TemplateInput;
    const parsed = parseTemplate({ ...input, active: false }, 0);
    const db = getDb();
    const [row] = await db
      .insert(milestoneTemplates)
      .values({
        code: parsed.code,
        name: parsed.name,
        sequence: parsed.sequence,
        defaultWeight: parsed.defaultWeight,
        critical: parsed.critical,
        active: false,
        description: parsed.description,
        createdBy: identity.email,
      })
      .returning();
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "milestone_template.create_draft",
      entityType: "milestone_template",
      entityId: String(row.id),
      detailJson: JSON.stringify({ code: row.code, name: row.name }),
    });
    return Response.json({ milestoneTemplate: row }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json(
        { error: "节点编码或序号已经存在。" },
        { status: 409 },
      );
    }
    return apiError(error);
  }
}
