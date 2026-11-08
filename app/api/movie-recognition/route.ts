import { NextRequest, NextResponse } from "next/server";
import { guardRoute } from "@/lib/apiGuard";
import { MovieRecognitionInputSchema, type MovieRecognitionResult } from "@/lib/validations/movieRecognition";
import { processMovieRecognition } from "@/lib/movieFingerprint";
import { fetchMovieDetails } from "@/lib/tmdb";
import type { Json } from "@/types/database";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const guard = await guardRoute(req, "clipGenerate");
  if (guard.error) return guard.error;
  const { user, supabase } = guard;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = MovieRecognitionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { uploadKey, hint } = parsed.data;

  const { data: job, error: jobError } = await supabase
    .from("movie_recognition_jobs")
    .insert({
      user_id: user.id,
      upload_key: uploadKey,
      hint: hint ?? null,
      status: "processing",
      progress: 0,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    console.error("[api/movie-recognition] job insert failed:", jobError);
    return NextResponse.json({ error: "Failed to start recognition" }, { status: 500 });
  }

  try {
    const result = await processMovieRecognition(job.id, uploadKey, hint);

    const matchesWithDetails = await Promise.all(
      (result.matches ?? []).slice(0, 5).map(async (match) => {
        const details = await fetchMovieDetails(match.id);
        return { ...match, details };
      })
    );

    await supabase
      .from("movie_recognition_jobs")
      .update({
        status: result.status,
        progress: result.progress ?? 100,
        matches: matchesWithDetails as unknown as Json,
        error_message: result.error ?? null,
      })
      .eq("id", job.id);

    return NextResponse.json({
      jobId: job.id,
      status: result.status,
      matches: matchesWithDetails,
      progress: result.progress ?? 100,
      error: result.error,
    } satisfies MovieRecognitionResult);
  } catch (err) {
    console.error("[api/movie-recognition] recognition failed:", err);
    await supabase
      .from("movie_recognition_jobs")
      .update({ status: "failed", error_message: "Recognition failed", progress: 0 })
      .eq("id", job.id);

    return NextResponse.json({ error: "Recognition failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const guard = await guardRoute(req, "clipGenerate");
  if (guard.error) return guard.error;
  const { supabase } = guard;

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const { data: job, error } = await supabase
    .from("movie_recognition_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}