import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { sessionEmail } from "@/lib/password-auth";

export type AppRole = "executive" | "pmo" | "manager" | "admin";

export type RequestIdentity = {
  email: string;
  displayName: string;
  role: AppRole;
};

export async function getRequestIdentity(request: Request): Promise<RequestIdentity | null> {
  const url = new URL(request.url);
  const cookieEmail = await sessionEmail(request);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const isLocalDemo = isLocal && !cookieEmail;
  const email = cookieEmail || (isLocalDemo ? "demo@local" : "");
  if (!email) return null;

  const db = getDb();
  const configuredAdmins = String(
    (env as unknown as Record<string, unknown>).APP_ADMIN_EMAILS ?? "",
  )
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing && !existing.active) return null;
  if (existing) {
    const role =
      configuredAdmins.includes(email) && existing.role !== "admin"
        ? "admin"
        : existing.role;
    if (role !== existing.role) {
      await db.update(users).set({ role }).where(eq(users.email, email));
    }
    return {
      email: existing.email,
      displayName: existing.displayName,
      role,
    };
  }

  if (!isLocalDemo) return null;
  const displayName = "本地演示用户";
  await db
    .insert(users)
    .values({ email, displayName, role: "admin" })
    .onConflictDoNothing();
  return { email, displayName, role: "admin" };
}

export function canWriteProject(identity: RequestIdentity, ownerEmail: string) {
  return (
    identity.role === "admin" ||
    identity.role === "pmo" ||
    (identity.role === "manager" && identity.email === ownerEmail.toLowerCase())
  );
}

export function canManagePortfolio(identity: RequestIdentity) {
  return identity.role === "admin" || identity.role === "pmo";
}

export function canAdministerUsers(identity: RequestIdentity) {
  return identity.role === "admin";
}

export function unauthorized() {
  return Response.json(
    { error: "请先登录，或联系管理员确认账号已经开通。" },
    { status: 401 },
  );
}

export function forbidden() {
  return Response.json({ error: "当前账号没有执行此操作的权限。" }, { status: 403 });
}
