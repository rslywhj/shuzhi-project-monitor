import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    const rows = await getDb().select().from(users).orderBy(asc(users.displayName));
    return Response.json({ users: rows });
  } catch (error) {
    return apiError(error);
  }
}
