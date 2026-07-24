import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attachments, projects, snapshots } from "@/db/schema";
import { ApiRequestError, apiError } from "@/lib/api-utils";
import {
  lifecycleLockedResponse,
  projectLifecycleLocked,
} from "@/lib/project-lifecycle";
import {
  canWriteProject,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";
import { getFileBucket } from "@/lib/storage";

export const dynamic = "force-dynamic";

function requiredId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new ApiRequestError("附件编号无效。");
  }
  return id;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const { id: value } = await context.params;
    const id = requiredId(value);
    const db = getDb();
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id))
      .limit(1);
    if (!attachment) {
      return Response.json({ error: "未找到指定附件。" }, { status: 404 });
    }
    const object = await getFileBucket().get(attachment.objectKey);
    if (!object) {
      return Response.json(
        { error: "附件文件不存在，请联系管理员核查存储记录。" },
        { status: 410 },
      );
    }
    const encodedName = encodeURIComponent(attachment.filename);
    return new Response(object.body, {
      headers: {
        "content-type": attachment.contentType,
        "content-length": String(attachment.sizeBytes),
        "content-disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "cache-control": "private, no-store",
        etag: object.httpEtag,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const { id: value } = await context.params;
    const id = requiredId(value);
    const db = getDb();
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id))
      .limit(1);
    if (!attachment) {
      return Response.json({ error: "未找到指定附件。" }, { status: 404 });
    }
    const [project] = await db
      .select({ ownerEmail: projects.ownerEmail })
      .from(projects)
      .where(eq(projects.id, attachment.projectId))
      .limit(1);
    if (!project) {
      return Response.json({ error: "附件所属项目不存在。" }, { status: 404 });
    }
    if (!canWriteProject(identity, project.ownerEmail)) return forbidden();
    if (projectLifecycleLocked(project)) return lifecycleLockedResponse(project);
    const [latest] = await db
      .select({ status: snapshots.status })
      .from(snapshots)
      .where(eq(snapshots.weekKey, attachment.weekKey))
      .orderBy(desc(snapshots.version))
      .limit(1);
    if (latest?.status === "locked") {
      return Response.json(
        { error: "该周期快照已经锁定，不能删除附件。" },
        { status: 409 },
      );
    }
    await getFileBucket().delete(attachment.objectKey);
    await db.$client.batch([
      db.$client
        .prepare("DELETE FROM attachments WHERE id = ?")
        .bind(id),
      db.$client
        .prepare(
          `INSERT INTO audit_logs (
            actor_email, action, entity_type, entity_id, detail_json
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          identity.email,
          "attachment.delete",
          "attachment",
          String(id),
          JSON.stringify({
            projectId: attachment.projectId,
            weekKey: attachment.weekKey,
            filename: attachment.filename,
          }),
        ),
    ]);
    return Response.json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
