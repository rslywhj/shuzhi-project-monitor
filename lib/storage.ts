import { env } from "cloudflare:workers";

export function getFileBucket() {
  const bucket = (env as unknown as { FILES?: R2Bucket }).FILES;
  if (!bucket) {
    throw new Error(
      "Cloudflare R2 binding `FILES` is unavailable. Set the `r2` field in .openai/hosting.json to `FILES`.",
    );
  }
  return bucket;
}
