import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { safeSecretEqual } from "@/lib/security";

// Machine-to-machine: NOT behind guardRoute. Authenticated by x-worker-secret.
const ClipCallbackSchema = z.object({
  jobId: z.uuid(),
  status: z.enum(["done", "failed"]),
  clips: z
    .array(z.object({ r2Url: z.string(), duration: z.string().optional() }))
    .optional(),
  error: z.string().optional(),
});

const VideoCallbackSchema = z.object({
  videoId: z.uuid(),
  status: z.enum(["done", "failed"]),
  r2Url: z.string().optional(),
  error: z.string().optional(),
});

const CallbackSchema = z.union([ClipCallbackSchema, VideoCallbackSchema]);

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-worker-secret");
  if (!safeSecretEqual(secret, process.env.WORKER_SECRET)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CallbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const supabase = createServiceClient();

  try {
    if ("jobId" in parsed.data) {
      const { jobId, status, clips, error } = parsed.data;

      await supabase
        .from("clip_jobs")
        .update({ status, error_message: error ?? null })
        .eq("id", jobId);

      // Attach rendered video URLs to the job's clip rows (ordered).
      if (status === "done" && clips && clips.length > 0) {
        const { data: rows } = await supabase
          .from("clips")
          .select("id")
          .eq("job_id", jobId)
          .order("created_at", { ascending: true });

        if (rows) {
          await Promise.all(
            rows.slice(0, clips.length).map((row, i) =>
              supabase
                .from("clips")
                .update({ r2_url: clips[i].r2Url })
                .eq("id", row.id)
            )
          );
        }
      }
    } else {
      const { videoId, status, r2Url } = parsed.data;
      await supabase
        .from("faceless_videos")
        .update({ status, r2_url: r2Url ?? null })
        .eq("id", videoId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/worker/callback] update failed:", err);
    return NextResponse.json({ error: "Callback failed" }, { status: 500 });
  }
}
