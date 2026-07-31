import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../wrangler.production.jsonc", import.meta.url);
const targetPath = new URL("../wrangler.ci.jsonc", import.meta.url);
const config = JSON.parse(await readFile(sourcePath, "utf8"));

// The custom domain is provisioned once from the production configuration.
// CI only updates the existing Worker so its token does not need zone-route
// mutation permission and cannot accidentally replace the domain binding.
delete config.routes;

await writeFile(targetPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
