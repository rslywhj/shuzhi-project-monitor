import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ApiRequestError, requiredEmail } from "@/lib/api-utils";
import {
  projectOwnerAccountError,
  type ProjectOwnerAccount,
} from "@/lib/project-owner-rules";

export { projectOwnerAccountError, type ProjectOwnerAccount };

export async function requireProjectOwnerAccount(
  db: ReturnType<typeof getDb>,
  emailInput: unknown,
) {
  const email = requiredEmail(emailInput, "项目经理邮箱");
  const [account] = await db
    .select({
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const error = projectOwnerAccountError(account);
  if (error) throw new ApiRequestError(error);
  return account!;
}
