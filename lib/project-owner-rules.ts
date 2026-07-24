export type ProjectOwnerAccount = {
  email: string;
  displayName: string;
  role: "executive" | "pmo" | "manager" | "admin";
  active: boolean;
};

export function projectOwnerAccountError(
  account: ProjectOwnerAccount | undefined,
) {
  if (!account) {
    return "项目负责人账号尚未预置，请先在系统管理中创建项目经理账号。";
  }
  if (!account.active) {
    return "项目负责人账号已停用，请先启用账号或选择其他项目经理。";
  }
  if (account.role !== "manager") {
    return "项目负责人必须选择角色为“项目经理”的已启用账号。";
  }
  return "";
}
