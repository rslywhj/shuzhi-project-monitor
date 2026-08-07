import { existsSync, realpathSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";

const workspace = realpathSync(process.cwd());
const target = resolve(workspace, ".wrangler", "state");
const expectedPrefix = `${resolve(workspace, ".wrangler")}${sep}`;

if (!target.startsWith(expectedPrefix)) {
  throw new Error(`拒绝清理工作区以外的目录：${target}`);
}

if (existsSync(target)) {
  rmSync(target, { recursive: true, force: true });
  console.log(`已清理本地D1状态：${target}`);
} else {
  console.log(`本地D1状态不存在，无需清理：${target}`);
}
