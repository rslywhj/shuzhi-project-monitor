import { count } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    const db = getDb();
    const [{ value }] = await db.select({ value: count() }).from(projects);
    return Response.json({
      status: "ok",
      database: "connected",
      projects: value,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
