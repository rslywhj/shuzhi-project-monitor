import { getDb } from "@/db";
import { auditLogs, securityConfigs } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import {
  canAdministerUsers,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";
import {
  getPasswordPolicy,
  type PasswordPolicy,
} from "@/lib/password-policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    return Response.json({ passwordPolicy: await getPasswordPolicy() });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canAdministerUsers(identity)) return forbidden();
    const payload = (await request.json()) as Partial<PasswordPolicy>;
    if (
      !Number.isInteger(payload.minPasswordLength) ||
      payload.minPasswordLength! < 8 ||
      payload.minPasswordLength! > 64
    ) {
      return Response.json(
        { error: "密码最小长度必须为8–64位整数。" },
        { status: 400 },
      );
    }
    const booleanFields = [
      "requireLetter",
      "requireUppercase",
      "requireLowercase",
      "requireNumber",
      "requireSymbol",
    ] as const;
    if (booleanFields.some((field) => typeof payload[field] !== "boolean")) {
      return Response.json(
        { error: "密码字符类别配置不完整。" },
        { status: 400 },
      );
    }
    const passwordPolicy: PasswordPolicy = {
      minPasswordLength: payload.minPasswordLength!,
      requireLetter: payload.requireLetter!,
      requireUppercase: payload.requireUppercase!,
      requireLowercase: payload.requireLowercase!,
      requireNumber: payload.requireNumber!,
      requireSymbol: payload.requireSymbol!,
    };
    const updatedAt = new Date().toISOString();
    const db = getDb();
    await db.batch([
      db
        .insert(securityConfigs)
        .values({
          id: 1,
          ...passwordPolicy,
          updatedBy: identity.email,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: securityConfigs.id,
          set: {
            ...passwordPolicy,
            updatedBy: identity.email,
            updatedAt,
          },
        }),
      db.insert(auditLogs).values({
        actorEmail: identity.email,
        action: "security_config.update",
        entityType: "security_config",
        entityId: "password-policy",
        detailJson: JSON.stringify(passwordPolicy),
      }),
    ]);
    return Response.json({ passwordPolicy });
  } catch (error) {
    return apiError(error);
  }
}
