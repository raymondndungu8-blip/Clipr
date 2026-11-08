import type { MovieMatch, MovieRecognitionResult } from "@/lib/validations/movieRecognition";

export interface FingerprintProvider {
  name: string;
  generateFingerprint(videoPath: string): Promise<string>;
  identify(fingerprint: string, hint?: string): Promise<MovieMatch[]>;
}

export interface FingerprintJob {
  id: string;
  uploadKey: string;
  status: "pending" | "processing" | "done" | "failed";
  fingerprint?: string;
  matches?: MovieMatch[];
  error?: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

class MockFingerprintProvider implements FingerprintProvider {
  name = "mock";

  async generateFingerprint(videoPath: string): Promise<string> {
    await new Promise((r) => setTimeout(r, 1000));
    return `fp_${Buffer.from(videoPath).toString("base64").slice(0, 32)}`;
  }

  async identify(fingerprint: string, hint?: string): Promise<MovieMatch[]> {
    await new Promise((r) => setTimeout(r, 2000));

    const mockMovies: MovieMatch[] = [
      {
        id: "tt0111161",
        title: "The Shawshank Redemption",
        year: 1994,
        overview: "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
        posterPath: "/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg",
        backdropPath: "/xBKGJQsAIeweesB79KC89FpBrVr.jpg",
        voteAverage: 9.3,
        voteCount: 2500000,
        genreIds: [18, 80],
        confidence: 0.95,
        matchType: "exact",
        timestamp: 120,
        duration: 30,
      },
      {
        id: "tt0068646",
        title: "The Godfather",
        year: 1972,
        overview: "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant youngest son.",
        posterPath: "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg",
        backdropPath: "/tmU7GeKVybMWFButWEGl2M4GeiP.jpg",
        voteAverage: 9.2,
        voteCount: 1800000,
        genreIds: [18, 80],
        confidence: 0.87,
        matchType: "high",
        timestamp: 45,
        duration: 25,
      },
      {
        id: "tt0468569",
        title: "The Dark Knight",
        year: 2008,
        overview: "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.",
        posterPath: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
        backdropPath: "/nMkZJBWW9j4QM5v3F2fPrq3gf0T.jpg",
        voteAverage: 9.0,
        voteCount: 2800000,
        genreIds: [28, 80, 18, 53],
        confidence: 0.72,
        matchType: "medium",
        timestamp: 200,
        duration: 40,
      },
    ];

    if (hint) {
      const hintLower = hint.toLowerCase();
      return mockMovies.filter((m) =>
        m.title.toLowerCase().includes(hintLower) ||
        m.overview?.toLowerCase().includes(hintLower) ||
        m.genreIds?.some((g) => hintLower.includes(g.toString()))
      );
    }

    return mockMovies;
  }
}

let fingerprintProvider: FingerprintProvider = new MockFingerprintProvider();

export function setFingerprintProvider(provider: FingerprintProvider) {
  fingerprintProvider = provider;
}

export function getFingerprintProvider(): FingerprintProvider {
  return fingerprintProvider;
}

export async function processMovieRecognition(
  jobId: string,
  uploadKey: string,
  hint?: string
): Promise<MovieRecognitionResult> {
  const provider = getFingerprintProvider();

  try {
    const fingerprint = await provider.generateFingerprint(uploadKey);
    const matches = await provider.identify(fingerprint, hint);

    return {
      jobId,
      status: "done",
      matches,
      progress: 100,
    };
  } catch (error) {
    console.error("[movieFingerprint] recognition failed:", error);
    return {
      jobId,
      status: "failed",
      error: error instanceof Error ? error.message : "Recognition failed",
      progress: 0,
    };
  }
}

export const FINGERPRINT_PROVIDERS = {
  mock: new MockFingerprintProvider(),
} as const;

export type FingerprintProviderName = keyof typeof FINGERPRINT_PROVIDERS;