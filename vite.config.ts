import vinext from "vinext";
import { defineConfig } from "vite";

const DATABASE_ID = "1f5f6bde-24e0-4c3b-8fd1-812690e613fc";
const FILES_KV_ID = "98fae6916ed74918bae51e82dc8618b1";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  name: "shuzhi-project-monitor",
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  triggers: {
    crons: ["0 * * * *"],
  },
  d1_databases: [
    {
      binding: "DB",
      database_name: "shuzhi-project-monitor",
      database_id: DATABASE_ID,
    },
  ],
  kv_namespaces: [
    {
      binding: "FILES",
      id: FILES_KV_ID,
    },
  ],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
