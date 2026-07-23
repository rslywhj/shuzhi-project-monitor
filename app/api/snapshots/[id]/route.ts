import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { snapshots } from "@/db/schema";
import { ApiRequestError, apiError } from "@/lib/api-utils";
import { getRequestIdentity, unauthorized } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const { id: encodedId } = await context.params;
    const id = decodeURIComponent(encodedId);
    const versionValue = new URL(request.url).searchParams.get("version");
    const requestedVersion = versionValue ? Number(versionValue) : null;
    if (
      requestedVersion !== null &&
      (!Number.isInteger(requestedVersion) || requestedVersion < 1)
    ) {
      throw new ApiRequestError("快照版本号无效。");
    }

    const db = getDb();
    const numericId = Number(id);
    const rows = Number.isInteger(numericId) && numericId > 0
      ? await db
          .select()
          .from(snapshots)
          .where(eq(snapshots.id, numericId))
          .limit(1)
      : await db
          .select()
          .from(snapshots)
          .where(
            requestedVersion
              ? and(
                  eq(snapshots.weekKey, id),
                  eq(snapshots.version, requestedVersion),
                )
              : eq(snapshots.weekKey, id),
          )
          .orderBy(desc(snapshots.version))
          .limit(1);
    const snapshot = rows[0];
    if (!snapshot) {
      return Response.json({ error: "未找到指定快照。" }, { status: 404 });
    }
    return Response.json({
      snapshot: {
        ...snapshot,
        payload: JSON.parse(snapshot.payloadJson) as unknown,
        payloadJson: undefined,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
