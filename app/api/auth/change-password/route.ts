import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import {
  clearSessionCookie,
  hashPassword,
  verifyPassword,
} from "@/lib/password-auth";
import {
  getPasswordPolicy,
  validatePassword,
} from "@/lib/password-policy";
import { getRequestIdentity, unauthorized } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const payload = (await request.json()) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };
    const currentPassword =
      typeof payload.currentPassword === "string"
        ? payload.currentPassword
        : "";
    const newPassword =
      typeof payload.newPassword === "string" ? payload.newPassword : "";
    const passwordPolicy = await getPasswordPolicy();
    const validationError = validatePassword(newPassword, passwordPolicy);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }

    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, identity.email))
      .limit(1);
    if (
      !user?.passwordHash ||
      !user.passwordSalt ||
      !user.passwordIterations ||
      !(await verifyPassword(
        currentPassword,
        user.passwordHash,
        user.passwordSalt,
        user.passwordIterations,
      ))
    ) {
      return Response.json(
        { error: "当前密码不正确。" },
        { status: 400 },
      );
    }

    const credentials = await hashPassword(newPassword, passwordPolicy);
    await db.batch([
      db
        .update(users)
        .set(credentials)
        .where(eq(users.email, identity.email)),
      db.insert(auditLogs).values({
        actorEmail: identity.email,
        action: "user.password_change",
        entityType: "user",
        entityId: identity.email,
        detailJson: "{}",
      }),
    ]);
    return Response.json(
      { changed: true, reauthenticationRequired: true },
      {
        headers: {
          "cache-control": "no-store",
          "set-cookie": clearSessionCookie(),
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
