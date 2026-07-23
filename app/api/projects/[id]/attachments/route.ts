import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  attachments,
  auditLogs,
  milestones,
  projects,
  snapshots,
} from "@/db/schema";
import { ApiRequestError, apiError, requiredWeekKey } from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import {
  canWriteProject,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";
import { getFileBucket } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedExtensions = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "png",
  "jpg",
  "jpeg",
  "txt",
  "csv",
  "zip",
]);
const allowedContentTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);

function publicAttachment(row: typeof attachments.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    weekKey: row.weekKey,
    milestoneId: row.milestoneId,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
  };
}

async function isWeekLocked(weekKey: string) {
  const db = getDb();
  const [latest] = await db
    .select({ status: snapshots.status })
    .from(snapshots)
    .where(eq(snapshots.weekKey, weekKey))
    .orderBy(desc(snapshots.version))
    .limit(1);
  return latest?.status === "locked";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const { id } = await context.params;
    const weekValue = new URL(request.url).searchParams.get("weekKey");
    const weekKey = weekValue
      ? requiredWeekKey(weekValue, "附件周期")
      : null;
    const db = getDb();
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!project) {
      return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    }
    const rows = await db
      .select()
      .from(attachments)
      .where(
        weekKey
          ? and(
              eq(attachments.projectId, id),
              eq(attachments.weekKey, weekKey),
            )
          : eq(attachments.projectId, id),
      )
      .orderBy(desc(attachments.createdAt), desc(attachments.id))
      .limit(200);
    return Response.json({ attachments: rows.map(publicAttachment) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const { id } = await context.params;
    const db = getDb();
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!project) {
      return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    }
    if (!canWriteProject(identity, project.ownerEmail)) return forbidden();

    const form = await request.formData();
    const weekKey = requiredWeekKey(form.get("weekKey"), "附件周期");
    if (await isWeekLocked(weekKey)) {
      return Response.json(
        { error: "该周期快照已经锁定，不能新增附件。" },
        { status: 409 },
      );
    }
    const value = form.get("file");
    if (!(value instanceof File)) {
      throw new ApiRequestError("请选择需要上传的附件。");
    }
    if (value.size <= 0 || value.size > MAX_FILE_SIZE) {
      throw new ApiRequestError("附件大小必须大于0且不超过10MB。");
    }
    const filename = value.name
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 180);
    const extension = filename.split(".").pop()?.toLowerCase() ?? "";
    const contentType = value.type || "application/octet-stream";
    if (
      !filename ||
      !allowedExtensions.has(extension) ||
      !allowedContentTypes.has(contentType)
    ) {
      throw new ApiRequestError(
        "仅支持 PDF、Office、图片、TXT、CSV 或 ZIP 文件。",
      );
    }
    const milestoneValue = form.get("milestoneId");
    const milestoneId = milestoneValue ? Number(milestoneValue) : null;
    if (
      milestoneId !== null &&
      (!Number.isInteger(milestoneId) || milestoneId < 1)
    ) {
      throw new ApiRequestError("关联节点无效。");
    }
    if (milestoneId !== null) {
      const [milestone] = await db
        .select({ id: milestones.id })
        .from(milestones)
        .where(
          and(
            eq(milestones.id, milestoneId),
            eq(milestones.projectId, id),
          ),
        )
        .limit(1);
      if (!milestone) {
        throw new ApiRequestError("关联节点不属于当前项目。");
      }
    }

    const safeSuffix = filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
    const objectKey = `${id}/${weekKey}/${crypto.randomUUID()}-${safeSuffix}`;
    const bucket = getFileBucket();
    await bucket.put(objectKey, value.stream(), {
      httpMetadata: { contentType },
      customMetadata: {
        filename: encodeURIComponent(filename),
        projectId: id,
        weekKey,
        uploadedBy: identity.email,
      },
    });
    let attachment: typeof attachments.$inferSelect | undefined;
    try {
      [attachment] = await db
        .insert(attachments)
        .values({
          projectId: id,
          weekKey,
          milestoneId,
          objectKey,
          filename,
          contentType,
          sizeBytes: value.size,
          uploadedBy: identity.email,
        })
        .returning();
      if (!attachment) {
        throw new Error("Attachment metadata could not be created.");
      }
      await db.insert(auditLogs).values({
        actorEmail: identity.email,
        action: "attachment.upload",
        entityType: "attachment",
        entityId: String(attachment.id),
        detailJson: JSON.stringify({
          projectId: id,
          weekKey,
          filename,
          sizeBytes: value.size,
        }),
      });
      return Response.json(
        { attachment: publicAttachment(attachment) },
        { status: 201 },
      );
    } catch (error) {
      if (attachment) {
        await db.delete(attachments).where(eq(attachments.id, attachment.id));
      }
      await bucket.delete(objectKey);
      throw error;
    }
  } catch (error) {
    return apiError(error);
  }
}
