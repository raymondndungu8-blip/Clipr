"use client";

import { useRef, useState, useEffect } from "react";
import { Upload, Film, CheckCircle, AlertCircle, Loader2, Sparkles, ArrowRight, X, Globe } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  PageTransition,
  FadeIn,
  ScaleIn,
  Stagger,
  StaggerItem,
} from "@/components/motion";
import { apiPost, ApiError, type FieldIssues } from "@/components/lib/api";
import { getImageUrl, getBackdropUrl, TMDB_GENRES } from "@/lib/tmdb";
import type { MovieMatch, MovieDetails } from "@/lib/validations/movieRecognition";

type MovieRecognitionJob = Tables<"movie_recognition_jobs">;

interface MovieMatchWithDetails extends MovieMatch {
  details?: MovieDetails;
}

const STAGES = [
  { threshold: 0, label: "Uploading video…" },
  { threshold: 10, label: "Generating fingerprint…" },
  { threshold: 30, label: "Analyzing video content…" },
  { threshold: 60, label: "Matching against movie database…" },
  { threshold: 90, label: "Fetching movie details…" },
  { threshold: 100, label: "Complete!" },
];

function stageLabel(progress: number): string {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (progress >= STAGES[i].threshold) return STAGES[i].label;
  }
  return STAGES[0].label;
}

function getMatchBadgeVariant(matchType: MovieMatch["matchType"]) {
  switch (matchType) {
    case "exact": return "default";
    case "high": return "secondary";
    case "medium": return "outline";
    case "low": return "destructive";
    default: return "outline";
  }
}

function formatGenreNames(genreIds: number[] | undefined): string {
  if (!genreIds || genreIds.length === 0) return "—";
  return genreIds
    .map((id) => TMDB_GENRES.find((g) => g.id === id)?.name)
    .filter(Boolean)
    .join(", ");
}

export default function MovieRecognitionPage() {
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<MovieRecognitionJob | null>(null);
  const [matches, setMatches] = useState<MovieMatchWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<FieldIssues>({});
  const [selectedMatch, setSelectedMatch] = useState<MovieMatchWithDetails | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  useEffect(() => {
    if (!jobId) return;

    const pollJob = async () => {
      const supabase = getSupabase();
      const deadline = Date.now() + 10 * 60 * 1000;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const { data } = await supabase
          .from("movie_recognition_jobs")
          .select("*")
          .eq("id", jobId)
          .single();

        if (data) {
          setJob(data);
          setProgress(data.progress ?? 0);

          if (data.matches && Array.isArray(data.matches)) {
            const matchesWithDetails = data.matches as unknown as MovieMatchWithDetails[];
            setMatches(matchesWithDetails);
          }

          if (data.status === "done") {
            setLoading(false);
            toast.success("Movie recognition complete!");
            return;
          }
          if (data.status === "failed") {
            toast.error(data.error_message ?? "Recognition failed. Please try again.");
            setLoading(false);
            return;
          }
        }
      }
      toast.error("Still processing — check back in a moment.");
      setLoading(false);
    };

    pollJob();
  }, [jobId]);

  async function onRecognize() {
    if (!file) {
      toast.error("Please upload a video file first.");
      return;
    }

    setLoading(true);
    setProgress(0);
    setFieldErrors({});
    setMatches([]);
    setJobId(null);
    setJob(null);
    setSelectedMatch(null);
    setShowDetails(false);

    try {
      setProgress(5);
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const { path, token } = await apiPost<{ path: string; token: string }>(
        "/api/upload-url",
        { ext }
      );
      const { error: upErr } = await getSupabase()
        .storage.from("uploads")
        .uploadToSignedUrl(path, token, file);
      if (upErr) {
        toast.error(`Upload failed: ${upErr.message}`);
        setLoading(false);
        return;
      }

      setProgress(15);
      const resp = await apiPost<{
        jobId: string;
        status: string;
        matches?: MovieMatchWithDetails[];
        progress?: number;
        error?: string;
      }>("/api/movie-recognition", {
        uploadKey: path,
        hint: hint.trim() || undefined,
      });

      setJobId(resp.jobId);
      setProgress(resp.progress ?? 20);

      if (resp.matches && resp.matches.length > 0) {
        setMatches(resp.matches);
      }

      if (resp.status === "done") {
        setProgress(100);
        setLoading(false);
        toast.success("Movie recognition complete!");
      }
    } catch (err) {
      setLoading(false);
      if (err instanceof ApiError) {
        if (err.status === 422) {
          setFieldErrors(err.issues ?? {});
          toast.error("Please fix the highlighted fields.");
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error("Something went wrong.");
      }
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) {
      if (f.size > 100 * 1024 * 1024) {
        toast.error("File too large. Maximum size is 100MB.");
        return;
      }
      if (!f.type.startsWith("video/")) {
        toast.error("Please select a video file.");
        return;
      }
      setFile(f);
    }
  }

  function reset() {
    setFile(null);
    setHint("");
    setJobId(null);
    setJob(null);
    setMatches([]);
    setLoading(false);
    setProgress(0);
    setFieldErrors({});
    setSelectedMatch(null);
    setShowDetails(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <PageTransition className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-clipr-text">Movie Recognition</h1>
        <p className="text-sm text-clipr-secondary">
          Upload a video clip to identify which movie it comes from.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* controls */}
        <FadeIn className="flex h-fit flex-col gap-5 rounded-2xl bg-clipr-card neo-raised p-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="video-upload">Upload Video Clip</Label>
            <input
              ref={fileInputRef}
              id="video-upload"
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={loading}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="justify-start"
            >
              <Upload className="size-3.5" />
              <span className="truncate">{file ? file.name : "Choose a video file"}</span>
            </Button>
            {file && (
              <p className="text-xs text-clipr-dim">
                {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB · {file.type}
              </p>
            )}
            {fieldErrors.uploadKey && (
              <p className="text-xs text-clipr-error">{fieldErrors.uploadKey[0]}</p>
            )}
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <Label htmlFor="hint">Search Hint (optional)</Label>
            <Input
              id="hint"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              className="bg-clipr-surface"
              placeholder="e.g., '90s action movie', 'Tom Hanks', 'prison escape'"
              disabled={loading}
              aria-invalid={!!fieldErrors.hint}
            />
            {fieldErrors.hint && (
              <p className="text-xs text-clipr-error">{fieldErrors.hint[0]}</p>
            )}
            <p className="text-xs text-clipr-dim">
              Helps narrow down matches if the clip is ambiguous.
            </p>
          </div>

          <Button
            onClick={onRecognize}
            disabled={loading || !file}
            className="mt-2"
            size="lg"
          >
            {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
            {loading ? "Recognizing…" : "Identify Movie"}
          </Button>

          {jobId && !loading && (
            <Button variant="ghost" size="sm" onClick={reset} className="mt-2">
              <X className="size-3.5 mr-1.5" />
              Start Over
            </Button>
          )}
        </FadeIn>

        {/* output */}
        <div className="flex flex-col gap-5">
          {loading && (
            <ScaleIn className="flex flex-col items-center gap-6 rounded-2xl bg-clipr-card neo-raised p-10 text-center">
              <svg width="150" height="150" viewBox="0 0 150 150">
                <circle
                  cx="75"
                  cy="75"
                  r="62"
                  fill="none"
                  stroke="var(--clipr-border)"
                  strokeWidth="10"
                />
                <circle
                  cx="75"
                  cy="75"
                  r="62"
                  fill="none"
                  stroke="var(--clipr-gold)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 62}
                  strokeDashoffset={2 * Math.PI * 62 * (1 - progress / 100)}
                  transform="rotate(-90 75 75)"
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
                <text
                  x="75"
                  y="75"
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: "var(--clipr-text)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 32,
                    fontWeight: 700,
                  }}
                >
                  {progress}%
                </text>
              </svg>
              <div>
                <p className="text-base font-semibold text-clipr-text">
                  {stageLabel(progress)}
                </p>
                <p className="mt-1 text-sm text-clipr-secondary">
                  Analyzing your video clip for movie matches…
                </p>
                <Progress value={progress} className="mt-4 w-full max-w-xs" />
              </div>
            </ScaleIn>
          )}

          {matches.length > 0 && !loading && (
            <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {matches.map((match) => (
                <StaggerItem key={match.id}>
                  <MovieMatchCard
                    match={match}
                    onSelect={setSelectedMatch}
                    isSelected={selectedMatch?.id === match.id}
                  />
                </StaggerItem>
              ))}
            </Stagger>
          )}

          {!loading && !jobId && matches.length === 0 && (
            <Card className="neo-raised">
              <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                <Film className="size-12 text-clipr-secondary opacity-50" />
                <div>
                  <p className="text-lg font-medium text-clipr-text">No video uploaded yet</p>
                  <p className="text-sm text-clipr-secondary mt-1">
                    Upload a video clip to identify the movie it comes from.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {job?.status === "failed" && (
            <Card className="neo-raised border-clipr-error/30">
              <CardContent className="flex items-center gap-3 p-4 text-clipr-error">
                <AlertCircle className="size-5 shrink-0" />
                <p>{job.error_message ?? "Recognition failed. Please try again."}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Movie Details Modal */}
      {selectedMatch && showDetails && (
        <MovieDetailsModal
          match={selectedMatch}
          onClose={() => {
            setShowDetails(false);
            setSelectedMatch(null);
          }}
        />
      )}
    </PageTransition>
  );
}

interface MovieMatchCardProps {
  match: MovieMatchWithDetails;
  onSelect: (match: MovieMatchWithDetails) => void;
  isSelected: boolean;
}

function MovieMatchCard({ match, onSelect, isSelected }: MovieMatchCardProps) {
  const posterUrl = getImageUrl(match.posterPath, "w342");
  const backdropUrl = getBackdropUrl(match.backdropPath, "w780");
  const year = match.year ? ` (${match.year})` : "";
  const confidencePercent = Math.round(match.confidence * 100);

  return (
    <Card
      className={cn(
        "neo-raised relative overflow-hidden transition-all cursor-pointer",
        isSelected && "ring-2 ring-clipr-gold shadow-lg"
      )}
      onClick={() => onSelect(match)}
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        {backdropUrl && (
          <img
            src={backdropUrl}
            alt={`${match.title} backdrop`}
            className="w-full h-full object-cover opacity-30"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        {posterUrl && (
          <img
            src={posterUrl}
            alt={`${match.title} poster`}
            className="absolute bottom-0 left-4 -mb-10 w-20 h-30 object-cover rounded shadow-lg border-2 border-clipr-bg"
          />
        )}
        <div className="absolute top-2 right-2">
          <Badge variant={getMatchBadgeVariant(match.matchType)} className="text-xs">
            {match.matchType.charAt(0).toUpperCase() + match.matchType.slice(1)} Match
          </Badge>
        </div>
        <div className="absolute bottom-2 left-2 flex items-center gap-1 text-xs text-white/80">
          <Sparkles className="size-3" />
          <span>{confidencePercent}% confidence</span>
        </div>
      </div>

      <CardContent className="pt-14 pb-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-clipr-text truncate">
              {match.title}{year}
            </h3>
            {match.overview && (
              <p className="mt-1 text-sm text-clipr-secondary line-clamp-2">
                {match.overview}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(match);
            }}
            className="text-clipr-secondary hover:text-clipr-gold"
          >
            <ArrowRight className="size-4" />
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {formatGenreNames(match.genreIds)
            .split(", ")
            .slice(0, 3)
            .map((genre) => (
              <Badge key={genre} variant="outline" className="text-xs">
                {genre}
              </Badge>
            ))}
        </div>

        {match.voteAverage && (
          <div className="mt-3 flex items-center gap-2 text-sm text-clipr-secondary">
            <span className="flex items-center gap-1">
              <CheckCircle className="size-3.5 text-clipr-gold" />
              <span>{match.voteAverage.toFixed(1)}</span>
            </span>
            {match.voteCount && (
              <span>· {formatVoteCount(match.voteCount)} votes</span>
            )}
          </div>
        )}

        {match.timestamp !== undefined && (
          <div className="mt-3 text-xs text-clipr-dim">
            Matched at {formatTime(match.timestamp)}
            {match.duration && ` · Duration: ${match.duration}s`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatVoteCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface MovieDetailsModalProps {
  match: MovieMatchWithDetails;
  onClose: () => void;
}

function MovieDetailsModal({ match, onClose }: MovieDetailsModalProps) {
  const backdropUrl = getBackdropUrl(match.backdropPath, "w1280");
  const posterUrl = getImageUrl(match.posterPath, "w500");

  const [selectedRegion, setSelectedRegion] = useState("US");

  const details = match.details;

  interface WatchProvider {
    provider_id: number;
    provider_name: string;
    logo_path: string;
    display_priority: number;
  }

  interface RegionWatchProviders {
    link?: string;
    flatrate?: WatchProvider[];
    rent?: WatchProvider[];
    buy?: WatchProvider[];
    ads?: WatchProvider[];
  }

  const watchProviders = details ? (details.watchProviders?.results?.[selectedRegion] as RegionWatchProviders | undefined) : undefined;
  const flatrate = watchProviders?.flatrate ?? [];
  const rent = watchProviders?.rent ?? [];
  const buy = watchProviders?.buy ?? [];
  const ads = watchProviders?.ads ?? [];

  const availableRegions = details?.watchProviders?.results ? Object.keys(details.watchProviders.results).sort() : [];

  const getProviderLogoUrl = (logoPath: string) => `https://image.tmdb.org/t/p/w92${logoPath}`;

  const renderProviderSection = (title: string, providers: WatchProvider[]) => {
    if (providers.length === 0) return null;
    return (
      <div className="mt-3">
        <h4 className="text-sm font-medium text-clipr-secondary mb-2 capitalize">{title}</h4>
        <div className="flex flex-wrap gap-3">
          {providers
            .sort((a, b) => a.display_priority - b.display_priority)
            .slice(0, 8)
            .map((provider) => (
              <a
                key={provider.provider_id}
                href={watchProviders?.link ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 p-2 rounded-lg bg-clipr-surface border border-clipr-border hover:border-clipr-gold/50 transition-colors min-w-[80px]"
                title={provider.provider_name}
              >
                <img
                  src={getProviderLogoUrl(provider.logo_path)}
                  alt={provider.provider_name}
                  className="w-10 h-10 object-contain"
                  loading="lazy"
                />
                <span className="text-xs font-medium text-clipr-text truncate text-center">{provider.provider_name}</span>
              </a>
            ))}
        </div>
      </div>
    );
  };

  if (!details) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
        <div className="bg-clipr-card neo-raised rounded-2xl p-8 max-w-md w-full text-center">
          <Loader2 className="size-8 mx-auto animate-spin text-clipr-gold" />
          <p className="mt-4 text-clipr-secondary">Loading movie details…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="bg-clipr-card neo-raised rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Backdrop */}
        {backdropUrl && (
          <div className="relative aspect-[16/9]">
            <img
              src={backdropUrl}
              alt=""
              className="w-full h-full object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 flex gap-4">
              {posterUrl && (
                <img
                  src={posterUrl}
                  alt={`${match.title} poster`}
                  className="h-40 w-auto object-cover rounded shadow-xl border-2 border-white/20"
                />
              )}
              <div className="flex-1 min-w-0 pt-8">
                <h2 className="text-2xl font-bold text-white truncate">
                  {details.title} {details.releaseDate ? `(${details.releaseDate.slice(0, 4)})` : ""}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-white/80 text-sm">
                  {details.genres?.slice(0, 3).map((g) => (
                    <Badge key={g.id} variant="outline" className="bg-white/10 text-white/80 border-white/20">
                      {g.name}
                    </Badge>
                  ))}
                  {details.runtime && (
                    <span>{details.runtime} min</span>
                  )}
                  {details.voteAverage && (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="size-3.5 text-clipr-gold" />
                      {details.voteAverage.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[calc(90vh-300px)] overflow-y-auto">
          {details.overview && (
            <div>
              <h3 className="font-semibold text-clipr-text">Overview</h3>
              <p className="mt-2 text-clipr-secondary">{details.overview}</p>
            </div>
          )}

          {details.cast && details.cast.length > 0 && (
            <div>
              <h3 className="font-semibold text-clipr-text">Cast</h3>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {details.cast.slice(0, 10).map((actor) => {
                  const profileUrl = actor.profilePath ? getImageUrl(actor.profilePath, "w185") : null;
                  return (
                    <div key={actor.id} className="flex flex-col items-center gap-1 text-center">
                      {profileUrl ? (
                        <img
                          src={profileUrl}
                          alt={actor.name}
                          className="w-20 h-20 rounded-full object-cover border border-clipr-border"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-clipr-surface flex items-center justify-center border border-clipr-border">
                          <Film className="size-6 text-clipr-secondary" />
                        </div>
                      )}
                      <span className="text-xs font-medium text-clipr-text truncate w-full">{actor.name}</span>
                      {actor.character && (
                        <span className="text-xs text-clipr-secondary truncate w-full">
                          as {actor.character}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {details.keywords && details.keywords.length > 0 && (
            <div>
              <h3 className="font-semibold text-clipr-text">Keywords</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {details.keywords.slice(0, 10).map((k) => (
                  <Badge key={k.id} variant="secondary" className="text-xs">
                    {k.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {watchProviders && (flatrate.length > 0 || rent.length > 0 || buy.length > 0 || ads.length > 0) && (
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-clipr-text flex items-center gap-2">
                  <Globe className="size-4" />
                  Where to Watch
                </h3>
                {availableRegions.length > 1 && (
                  <select
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    className="bg-clipr-surface border border-clipr-border rounded-lg px-3 py-1.5 text-sm text-clipr-text focus:outline-none focus:ring-2 focus:ring-clipr-gold"
                    aria-label="Select region"
                  >
                    {availableRegions.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {renderProviderSection("streaming (subscription)", flatrate)}
              {renderProviderSection("rent", rent)}
              {renderProviderSection("buy", buy)}
              {renderProviderSection("free with ads", ads)}
              {watchProviders.link && (
                <div className="mt-4">
                  <a
                    href={watchProviders.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-clipr-gold hover:underline"
                  >
                    View all options on TMDB
                    <ArrowRight className="size-4" />
                  </a>
                </div>
              )}
            </div>
          )}

          {details.recommendations?.results?.length && (
            <div>
              <h3 className="font-semibold text-clipr-text">Recommended</h3>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {details.recommendations.results.slice(0, 5).map((rec) => {
                  const posterUrl = rec.posterPath ? getImageUrl(rec.posterPath, "w185") : null;
                  return (
                    <div key={rec.id} className="flex flex-col items-center gap-1 text-center">
                      {posterUrl ? (
                        <img
                          src={posterUrl}
                          alt={rec.title}
                          className="w-20 h-30 rounded object-cover border border-clipr-border"
                        />
                      ) : (
                        <div className="w-20 h-30 rounded bg-clipr-surface flex items-center justify-center border border-clipr-border">
                          <Film className="size-6 text-clipr-secondary" />
                        </div>
                      )}
                      <span className="text-xs font-medium text-clipr-text truncate w-full">{rec.title}</span>
                      {rec.voteAverage && (
                        <span className="text-xs text-clipr-gold flex items-center gap-1">
                          <CheckCircle className="size-3" />
                          {rec.voteAverage.toFixed(1)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {details.similar?.results?.length && (
            <div>
              <h3 className="font-semibold text-clipr-text">Similar Movies</h3>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {details.similar.results.slice(0, 5).map((rec) => {
                  const posterUrl = rec.posterPath ? getImageUrl(rec.posterPath, "w185") : null;
                  return (
                    <div key={rec.id} className="flex flex-col items-center gap-1 text-center">
                      {posterUrl ? (
                        <img
                          src={posterUrl}
                          alt={rec.title}
                          className="w-20 h-30 rounded object-cover border border-clipr-border"
                        />
                      ) : (
                        <div className="w-20 h-30 rounded bg-clipr-surface flex items-center justify-center border border-clipr-border">
                          <Film className="size-6 text-clipr-secondary" />
                        </div>
                      )}
                      <span className="text-xs font-medium text-clipr-text truncate w-full">{rec.title}</span>
                      {rec.voteAverage && (
                        <span className="text-xs text-clipr-gold flex items-center gap-1">
                          <CheckCircle className="size-3" />
                          {rec.voteAverage.toFixed(1)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
      </div>
    </div>
  );
}