import { env } from "cloudflare:workers";

type FileMetadata = {
  contentType?: string;
  etag?: string;
  [key: string]: string | undefined;
};

export function getFileBucket() {
  const namespace = (env as unknown as { FILES?: KVNamespace }).FILES;
  if (!namespace) {
    throw new Error(
      "Cloudflare KV binding `FILES` is unavailable.",
    );
  }
  return {
    async get(key: string) {
      const result = await namespace.getWithMetadata<FileMetadata>(
        key,
        "stream",
      );
      if (!result.value) return null;
      return {
        body: result.value,
        httpEtag: result.metadata?.etag ?? `W/"${key}"`,
      };
    },
    async put(
      key: string,
      value: ReadableStream,
      options?: {
        httpMetadata?: { contentType?: string };
        customMetadata?: Record<string, string>;
      },
    ) {
      await namespace.put(key, value, {
        metadata: {
          ...(options?.customMetadata ?? {}),
          contentType: options?.httpMetadata?.contentType,
          etag: `"${crypto.randomUUID()}"`,
        } satisfies FileMetadata,
      });
    },
    delete(key: string) {
      return namespace.delete(key);
    },
  };
}
