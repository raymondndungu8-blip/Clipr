import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardRoute } from "@/lib/apiGuard";
import { renderAndUpload } from "@/lib/render";

// Rendering runs Node + Chromium (Remotion) — local dev / Node host only, not
// Vercel serverless. Allow a long render window.
export const maxDuration = 300;

const RenderSchema = z.object({ clipId: z.uuid() });

export async function POST(req: NextRequest) {
  const guard = await guardRoute(req, "clipGenerate");
  if (guard.error) return guard.error;
  const { supabase } = guard;

  const body = await req.json().catch(() => null);
  const parsed = RenderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  // RLS ensures the user can only render their own clip.
  const { data: clip } = await supabase
    .from("clips")
    .select("*")
    .eq("id", parsed.data.clipId)
    .single();
  if (!clip) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  try {
    const url = await renderAndUpload({
      compositionId: "CaptionClip",
      props: {
        hook: clip.hook ?? "",
        captions: clip.captions ?? [],
        gradient:
          clip.bg_gradient ??
          "linear-gradient(160deg, #14213d 0%, #0a0e1a 55%, #0e1b33 100%)",
        accent: "#3d7bff",
      },
      key: `clips/${clip.id}.mp4`,
    });

    await supabase.from("clips").update({ r2_url: url }).eq("id", clip.id);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[api/render] render failed:", err);
    return NextResponse.json({ error: "Render failed" }, { status: 500 });
  }
}
