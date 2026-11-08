import { z } from "zod";

export const MovieRecognitionInputSchema = z.object({
  uploadKey: z.string().min(1).max(300),
  /** Optional hint to narrow search (e.g., "action movie from 90s") */
  hint: z.string().max(500).optional(),
});

export type MovieRecognitionInput = z.infer<typeof MovieRecognitionInputSchema>;

export const MovieMatchSchema = z.object({
  id: z.string(),
  title: z.string(),
  year: z.number().optional(),
  overview: z.string().optional(),
  posterPath: z.string().optional(),
  backdropPath: z.string().optional(),
  voteAverage: z.number().optional(),
  voteCount: z.number().optional(),
  genreIds: z.array(z.number()).optional(),
  confidence: z.number().min(0).max(1),
  matchType: z.enum(["exact", "high", "medium", "low"]),
  timestamp: z.number().optional(),
  duration: z.number().optional(),
});

export type MovieMatch = z.infer<typeof MovieMatchSchema>;

export const MovieRecognitionResultSchema = z.object({
  jobId: z.string(),
  status: z.enum(["processing", "done", "failed"]),
  matches: z.array(MovieMatchSchema).optional(),
  error: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
});

export type MovieRecognitionResult = z.infer<typeof MovieRecognitionResultSchema>;

export const MovieDetailsSchema = z.object({
  id: z.number(),
  title: z.string(),
  originalTitle: z.string().optional(),
  overview: z.string().optional(),
  releaseDate: z.string().optional(),
  runtime: z.number().optional(),
  genres: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  voteAverage: z.number().optional(),
  voteCount: z.number().optional(),
  cast: z.array(z.object({
    id: z.number(),
    name: z.string(),
    character: z.string().optional(),
    profilePath: z.string().optional(),
  })).optional(),
  crew: z.array(z.object({
    id: z.number(),
    name: z.string(),
    job: z.string().optional(),
    department: z.string().optional(),
    profilePath: z.string().optional(),
  })).optional(),
  videos: z.array(z.object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
    site: z.string(),
    type: z.string(),
  })).optional(),
  images: z.object({
    backdrops: z.array(z.object({ filePath: z.string() })).optional(),
    posters: z.array(z.object({ filePath: z.string() })).optional(),
  }).optional(),
  keywords: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  recommendations: z.object({
    results: z.array(z.object({
      id: z.number(),
      title: z.string(),
      posterPath: z.string().optional(),
      voteAverage: z.number().optional(),
    })).optional(),
  }).optional(),
  similar: z.object({
    results: z.array(z.object({
      id: z.number(),
      title: z.string(),
      posterPath: z.string().optional(),
      voteAverage: z.number().optional(),
    })).optional(),
  }).optional(),
  watchProviders: z.object({
    results: z.record(z.string(), z.object({
      link: z.string().optional(),
      flatrate: z.array(z.object({
        provider_id: z.number(),
        provider_name: z.string(),
        logo_path: z.string(),
        display_priority: z.number(),
      })).optional(),
      rent: z.array(z.object({
        provider_id: z.number(),
        provider_name: z.string(),
        logo_path: z.string(),
        display_priority: z.number(),
      })).optional(),
      buy: z.array(z.object({
        provider_id: z.number(),
        provider_name: z.string(),
        logo_path: z.string(),
        display_priority: z.number(),
      })).optional(),
      ads: z.array(z.object({
        provider_id: z.number(),
        provider_name: z.string(),
        logo_path: z.string(),
        display_priority: z.number(),
      })).optional(),
    })).optional(),
  }).optional(),
});

export type MovieDetails = z.infer<typeof MovieDetailsSchema>;