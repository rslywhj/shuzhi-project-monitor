import { clearSessionCookie } from "@/lib/password-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(
    { loggedOut: true },
    {
      headers: {
        "cache-control": "no-store",
        "set-cookie": clearSessionCookie(),
      },
    },
  );
}
