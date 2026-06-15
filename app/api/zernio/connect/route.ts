import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardRoute } from "@/lib/apiGuard";
import { getConnectUrl, ZERNIO_PLATFORM } from "@/lib/zernio";

const ConnectSchema = z.object({
  platform: z.enum(["TikTok", "Instagram", "YouTube", "Facebook"]),
});

// POST — get a Zernio OAuth connect URL for a platform; the client opens it.
export async function POST(req: NextRequest) {
  const guard = await guardRoute(req, "accountsManage");
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => null);
  const parsed = ConnectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const slug = ZERNIO_PLATFORM[parsed.data.platform];

  try {
    const authUrl = await getConnectUrl(slug);
    return NextResponse.json({ authUrl });
  } catch (err) {
    console.error("[api/zernio/connect] failed:", err);
    return NextResponse.json(
      { error: "Could not start the connection. Try again." },
      { status: 502 }
    );
  }
}
