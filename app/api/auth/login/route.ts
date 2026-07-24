import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  createSessionToken,
  sessionCookie,
  verifyPassword,
} from "@/lib/password-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
  } | null;
  const email =
    typeof payload?.email === "string"
      ? payload.email.trim().toLowerCase()
      : "";
  const password =
    typeof payload?.password === "string" ? payload.password : "";
  if (!email || !password) {
    return Response.json(
      { error: "请输入登录邮箱和密码。" },
      { status: 400 },
    );
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  let passwordMatches = false;
  if (
    user?.active &&
    user.passwordHash &&
    user.passwordSalt &&
    user.passwordIterations
  ) {
    try {
      passwordMatches = await verifyPassword(
        password,
        user.passwordHash,
        user.passwordSalt,
        user.passwordIterations,
      );
    } catch (error) {
      console.error("Password verification failed.", error);
      return Response.json(
        { error: "登录服务暂时不可用，请稍后重试。" },
        { status: 500 },
      );
    }
  }
  const authenticated = Boolean(user?.active) && passwordMatches;
  if (!authenticated || !user) {
    return Response.json(
      { error: "邮箱或密码错误，或账号尚未启用。" },
      { status: 401 },
    );
  }

  const token = await createSessionToken(
    user.email,
    user.passwordChangedAt ?? "",
  );
  return Response.json(
    {
      identity: {
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    },
    {
      headers: {
        "cache-control": "no-store",
        "set-cookie": sessionCookie(token),
      },
    },
  );
}
