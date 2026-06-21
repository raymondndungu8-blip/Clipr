import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { guardRoute } from "@/lib/apiGuard";
import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = process.env.UPLOAD_BUCKET || "uploads";

// Returns a one-time signed URL the browser uploads the video straight to
// (Supabase Storage), so large files never pass through the app server.
export async function POST(req: NextRequest) {
  const guard = await guardRoute(req, "clipGenerate");
  if (guard.error) return guard.error;
  const { user } = guard;

  const body = (await req.json().catch(() => ({}))) as { ext?: string };
  const ext =
    typeof body?.ext === "string" && /^(mp4|mov|webm|mkv)$/i.test(body.ext)
      ? body.ext.toLowerCase()
      : "mp4";
  const path = `${user.id}/${randomUUID()}.${ext}`;

  const admin = createServiceClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[api/upload-url] failed:", error);
    return NextResponse.json(
      { error: "Couldn't start the upload. Try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({ path: data.path, token: data.token });
}
