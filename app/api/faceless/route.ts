import { NextRequest, NextResponse } from "next/server";
import { guardRoute } from "@/lib/apiGuard";
import { generateJSON } from "@/lib/anthropic";
import { listAccounts } from "@/lib/zernio";
import { uploadToR2 } from "@/lib/r2";
import { FacelessInputSchema } from "@/lib/validations/faceless";
import type { Json } from "@/types/database";

// ElevenLabs "Rachel" — sensible default narration voice.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

interface FacelessScene {
  scene: number;
  voiceover: string;
  visual: string;
  caption: string;
  duration: number;
}

interface FacelessScript {
  title: string;
  hook: string;
  script: FacelessScene[];
  endScreen: string;
  hashtags: string[];
  description: string;
  music: string;
  bgGradient: string;
  captions: string[];
}

const SCENE_COUNT: Record<string, string> = {
  "30s": "4-5",
  "45s": "5-6",
  "60s": "6-8",
  "90s": "8-10",
};

async function findStockVideo(query: string): Promise<string | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`,
      { headers: { Authorization: apiKey } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      videos?: { video_files?: { link: string; quality?: string }[] }[];
    };
    const files = data.videos?.[0]?.video_files;
    if (!files || files.length === 0) return null;
    const hd = files.find((f) => f.quality === "hd");
    return (hd ?? files[0]).link ?? null;
  } catch (err) {
    console.error("[api/faceless] Pexels lookup failed:", err);
    return null;
  }
}

async function generateVoiceover(
  videoId: string,
  text: string
): Promise<string | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
      }
    );
    if (!res.ok) {
      console.error("[api/faceless] ElevenLabs failed:", res.status);
      return null;
    }
    const audio = Buffer.from(await res.arrayBuffer());
    return await uploadToR2(`voiceovers/${videoId}.mp3`, audio, "audio/mpeg");
  } catch (err) {
    console.error("[api/faceless] voiceover generation failed:", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardRoute(req, "facelessGenerate");
  if (guard.error) return guard.error;
  const { user, supabase } = guard;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = FacelessInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { topic, niche, voice, duration, platforms } = parsed.data;

  // Gate: a social account must be connected (a manually-added page OR a
  // Zernio-connected account) before generating.
  {
    let connected = false;
    const { data: own } = await supabase
      .from("social_accounts")
      .select("id")
      .limit(1);
    if (own && own.length > 0) connected = true;
    if (!connected) {
      try {
        connected = (await listAccounts()).length > 0;
      } catch (err) {
        console.error("[api/faceless] connection check failed:", err);
      }
    }
    if (!connected) {
      return NextResponse.json(
        {
          error: "Connect a social account before generating.",
          code: "NO_CONNECTION",
        },
        { status: 403 }
      );
    }
  }

  try {
    // 1. Script from Claude
    const claudeJson = await generateJSON<FacelessScript>({
      system:
        "You are a viral faceless short-form video scriptwriter. Return valid JSON only.",
      prompt: `Write a faceless short-form video script.
Topic: "${topic}". Niche: ${niche}. Voice style: ${voice}. Target length: ${duration}. Platforms: ${platforms.join(", ")}.

Return a JSON object with:
- "title": video title
- "hook": opening line that stops the scroll
- "script": array of ${SCENE_COUNT[duration] ?? "5-7"} scene objects, each { "scene": number, "voiceover": narration sentence(s), "visual": 2-5 word stock-footage search phrase, "caption": short on-screen caption (UPPERCASE, 2-5 words), "duration": seconds (number) }
- "endScreen": closing call-to-action line
- "hashtags": array of 5 hashtags (with #)
- "description": 1-2 sentence post description
- "music": suggested background music mood
- "bgGradient": a dark CSS linear-gradient string suited to the mood
- "captions": array of 5 short caption chunks, 2-4 words each, ALL UPPERCASE

Scene durations must sum to roughly ${duration}. Return ONLY the JSON object.`,
      maxTokens: 6000,
    });

    if (!claudeJson || !Array.isArray(claudeJson.script)) {
      throw new Error("Claude did not return a valid faceless script");
    }

    // 2. Create the row up-front (we need the id for the voiceover R2 key)
    const { data: video, error: insertError } = await supabase
      .from("faceless_videos")
      .insert({
        user_id: user.id,
        topic,
        niche,
        voice_style: voice,
        duration,
        script_json: claudeJson as unknown as Json,
        status: "processing",
      })
      .select("id")
      .single();

    if (insertError || !video) {
      console.error("[api/faceless] insert failed:", insertError);
      return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }

    // 3. Stock footage per scene (Pexels) — tolerate missing key
    const stockVideoUrls = await Promise.all(
      claudeJson.script.map((scene) => findStockVideo(scene.visual))
    );
    const scenes = claudeJson.script.map((scene, i) => ({
      ...scene,
      stockVideoUrl: stockVideoUrls[i],
    }));

    // 4. Voiceover (ElevenLabs → R2) — tolerate missing key
    const voiceoverText = claudeJson.script
      .map((scene) => scene.voiceover)
      .join(" ");
    const voiceoverUrl = await generateVoiceover(video.id, voiceoverText);

    // 5. Dispatch to worker for assembly, or finish in script-only mode
    const workerUrl = process.env.WORKER_URL;
    const hasAssets =
      scenes.some((scene) => scene.stockVideoUrl) || Boolean(voiceoverUrl);
    let dispatched = false;

    if (workerUrl && hasAssets) {
      try {
        await fetch(`${workerUrl}/assemble`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-worker-secret": process.env.WORKER_SECRET ?? "",
          },
          body: JSON.stringify({ videoId: video.id, scenes, voiceoverUrl }),
        });
        dispatched = true;
      } catch (err) {
        console.error("[api/faceless] worker unreachable:", err);
      }
    }

    if (!dispatched) {
      // Script-only mode — the script itself is the deliverable.
      await supabase
        .from("faceless_videos")
        .update({ status: "done" })
        .eq("id", video.id);
    }

    return NextResponse.json({ videoId: video.id, script: claudeJson });
  } catch (err) {
    console.error("[api/faceless] generation failed:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
