import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { securityConfigs } from "@/db/schema";

export type PasswordPolicy = {
  minPasswordLength: number;
  requireLetter: boolean;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
};

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minPasswordLength: 12,
  requireLetter: true,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: true,
  requireSymbol: false,
};

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(securityConfigs)
    .where(eq(securityConfigs.id, 1))
    .limit(1);
  if (!row) return DEFAULT_PASSWORD_POLICY;
  return {
    minPasswordLength: row.minPasswordLength,
    requireLetter: row.requireLetter,
    requireUppercase: row.requireUppercase,
    requireLowercase: row.requireLowercase,
    requireNumber: row.requireNumber,
    requireSymbol: row.requireSymbol,
  };
}

export function validatePassword(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
) {
  if (
    password.length < policy.minPasswordLength ||
    password.length > 128
  ) {
    return `密码长度必须为${policy.minPasswordLength}–128个字符。`;
  }
  if (policy.requireLetter && !/[A-Za-z]/.test(password)) {
    return "密码必须包含字母。";
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    return "密码必须包含大写字母。";
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    return "密码必须包含小写字母。";
  }
  if (policy.requireNumber && !/\d/.test(password)) {
    return "密码必须包含数字。";
  }
  if (
    policy.requireSymbol &&
    !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)
  ) {
    return "密码必须包含特殊字符。";
  }
  return null;
}

export function passwordPolicySummary(policy: PasswordPolicy) {
  const requirements = [`至少${policy.minPasswordLength}位`];
  if (policy.requireLetter) requirements.push("字母");
  if (policy.requireUppercase) requirements.push("大写字母");
  if (policy.requireLowercase) requirements.push("小写字母");
  if (policy.requireNumber) requirements.push("数字");
  if (policy.requireSymbol) requirements.push("特殊字符");
  return requirements.join("、");
}
