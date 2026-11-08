import type { MovieDetails, MovieMatch } from "@/lib/validations/movieRecognition";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

const apiKey = process.env.TMDB_API_KEY;

function getHeaders(): HeadersInit {
  if (!apiKey) {
    throw new Error("TMDB_API_KEY not configured");
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

interface TMDBMovieDetails {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  runtime: number;
  genres: Array<{ id: number; name: string }>;
  vote_average: number;
  vote_count: number;
}

interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

interface TMDBCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

interface TMDBVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
}

interface TMDBImage {
  file_path: string;
}

interface TMDBKeyword {
  id: number;
  name: string;
}

interface TMDBRecommendations {
  results: Array<{
    id: number;
    title: string;
    poster_path: string | null;
    vote_average: number;
  }>;
}

interface TMDBSimilar {
  results: Array<{
    id: number;
    title: string;
    poster_path: string | null;
    vote_average: number;
  }>;
}

interface TMDBMovieSearchResult {
  id: number;
  title: string;
  release_date: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
}

interface TMDBWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

interface TMDBRegionWatchProviders {
  link?: string;
  flatrate?: TMDBWatchProvider[];
  rent?: TMDBWatchProvider[];
  buy?: TMDBWatchProvider[];
  ads?: TMDBWatchProvider[];
}

interface TMDBWatchProvidersResponse {
  results: Record<string, TMDBRegionWatchProviders>;
}

export async function fetchMovieDetails(movieId: string | number, region = "US"): Promise<MovieDetails | null> {
  if (!apiKey) {
    console.warn("[TMDB] API key not configured, returning mock data");
    return getMockMovieDetails(movieId);
  }

  try {
    const [detailsRes, creditsRes, videosRes, imagesRes, keywordsRes, recRes, similarRes, watchProvidersRes] = await Promise.all([
      fetch(`${TMDB_BASE_URL}/movie/${movieId}?append_to_response=release_dates`, { headers: getHeaders() }),
      fetch(`${TMDB_BASE_URL}/movie/${movieId}/credits`, { headers: getHeaders() }),
      fetch(`${TMDB_BASE_URL}/movie/${movieId}/videos`, { headers: getHeaders() }),
      fetch(`${TMDB_BASE_URL}/movie/${movieId}/images`, { headers: getHeaders() }),
      fetch(`${TMDB_BASE_URL}/movie/${movieId}/keywords`, { headers: getHeaders() }),
      fetch(`${TMDB_BASE_URL}/movie/${movieId}/recommendations`, { headers: getHeaders() }),
      fetch(`${TMDB_BASE_URL}/movie/${movieId}/similar`, { headers: getHeaders() }),
      fetch(`${TMDB_BASE_URL}/movie/${movieId}/watch/providers`, { headers: getHeaders() }),
    ]);

    if (!detailsRes.ok) {
      if (detailsRes.status === 404) return null;
      throw new Error(`TMDB details fetch failed: ${detailsRes.status}`);
    }

    const [details, credits, videos, images, keywords, recommendations, similar, watchProviders] = await Promise.all([
      detailsRes.json(),
      creditsRes.json(),
      videosRes.json(),
      imagesRes.json(),
      keywordsRes.json(),
      recRes.json(),
      similarRes.json(),
      watchProvidersRes.json(),
    ]);

    const typedDetails = details as TMDBMovieDetails;
    const typedCredits = credits as { cast: TMDBCastMember[]; crew: TMDBCrewMember[] };
    const typedVideos = videos as { results: TMDBVideo[] };
    const typedImages = images as { backdrops: TMDBImage[]; posters: TMDBImage[] };
    const typedKeywords = keywords as { keywords: TMDBKeyword[] };
    const typedRecommendations = recommendations as TMDBRecommendations;
    const typedSimilar = similar as TMDBSimilar;
    const typedWatchProviders = watchProviders as TMDBWatchProvidersResponse;

    return {
      id: typedDetails.id,
      title: typedDetails.title,
      originalTitle: typedDetails.original_title,
      overview: typedDetails.overview,
      releaseDate: typedDetails.release_date,
      runtime: typedDetails.runtime,
      genres: typedDetails.genres,
      voteAverage: typedDetails.vote_average,
      voteCount: typedDetails.vote_count,
      cast: typedCredits.cast?.slice(0, 20).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profilePath: c.profile_path ?? undefined,
      })),
      crew: typedCredits.crew?.slice(0, 20).map((c) => ({
        id: c.id,
        name: c.name,
        job: c.job,
        department: c.department,
        profilePath: c.profile_path ?? undefined,
      })),
      videos: typedVideos.results?.map((v) => ({
        id: v.id,
        key: v.key,
        name: v.name,
        site: v.site,
        type: v.type,
      })),
      images: {
        backdrops: typedImages.backdrops?.map((b) => ({ filePath: b.file_path })),
        posters: typedImages.posters?.map((p) => ({ filePath: p.file_path })),
      },
      keywords: typedKeywords.keywords?.map((k) => ({ id: k.id, name: k.name })),
      recommendations: typedRecommendations,
      similar: typedSimilar,
      watchProviders: typedWatchProviders,
    };
  } catch (error) {
    console.error("[TMDB] fetchMovieDetails failed:", error);
    return getMockMovieDetails(movieId);
  }
}

export async function searchMovies(query: string, page = 1): Promise<MovieMatch[]> {
  if (!apiKey) {
    console.warn("[TMDB] API key not configured, returning mock search results");
    return getMockSearchResults(query);
  }

  try {
    const res = await fetch(
      `${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(query)}&page=${page}`,
      { headers: getHeaders() }
    );

    if (!res.ok) throw new Error(`TMDB search failed: ${res.status}`);

    const data = await res.json();

    const typedResults = data.results as TMDBMovieSearchResult[];

    return typedResults.map((movie) => ({
      id: movie.id.toString(),
      title: movie.title,
      year: movie.release_date ? new Date(movie.release_date).getFullYear() : undefined,
      overview: movie.overview,
      posterPath: movie.poster_path ?? undefined,
      backdropPath: movie.backdrop_path ?? undefined,
      voteAverage: movie.vote_average,
      voteCount: movie.vote_count,
      genreIds: movie.genre_ids,
      confidence: Math.min(0.5 + (movie.vote_average / 20), 0.9),
      matchType: "medium" as const,
    }));
  } catch (error) {
    console.error("[TMDB] searchMovies failed:", error);
    return getMockSearchResults(query);
  }
}

export async function discoverMovies(options: {
  genre?: number;
  year?: number;
  sortBy?: string;
  page?: number;
}): Promise<MovieMatch[]> {
  if (!apiKey) return getMockSearchResults("");

  try {
    const params = new URLSearchParams({
      sort_by: options.sortBy || "popularity.desc",
      page: (options.page || 1).toString(),
    });

    if (options.genre) params.append("with_genres", options.genre.toString());
    if (options.year) params.append("primary_release_year", options.year.toString());

    const res = await fetch(`${TMDB_BASE_URL}/discover/movie?${params}`, { headers: getHeaders() });
    if (!res.ok) throw new Error(`TMDB discover failed: ${res.status}`);

    const data = await res.json();

    const typedResults = data.results as TMDBMovieSearchResult[];

    return typedResults.map((movie) => ({
      id: movie.id.toString(),
      title: movie.title,
      year: movie.release_date ? new Date(movie.release_date).getFullYear() : undefined,
      overview: movie.overview,
      posterPath: movie.poster_path ?? undefined,
      backdropPath: movie.backdrop_path ?? undefined,
      voteAverage: movie.vote_average,
      voteCount: movie.vote_count,
      genreIds: movie.genre_ids,
      confidence: Math.min(0.5 + (movie.vote_average / 20), 0.9),
      matchType: "medium" as const,
    }));
  } catch (error) {
    console.error("[TMDB] discoverMovies failed:", error);
    return getMockSearchResults("");
  }
}

export function getImageUrl(path: string | null | undefined, size: "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original" = "w500"): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

export function getBackdropUrl(path: string | null | undefined, size: "w300" | "w780" | "w1280" | "original" = "w1280"): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

function getMockMovieDetails(movieId: string | number): MovieDetails {
  return {
    id: typeof movieId === "string" ? parseInt(movieId) : movieId,
    title: "The Shawshank Redemption",
    originalTitle: "The Shawshank Redemption",
    overview: "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
    releaseDate: "1994-09-23",
    runtime: 142,
    genres: [{ id: 18, name: "Drama" }, { id: 80, name: "Crime" }],
    cast: [
      { id: 1, name: "Tim Robbins", character: "Andy Dufresne", profilePath: "/pLCdFcRQfDfubEvJSmhBZQq3lJx.jpg" },
      { id: 2, name: "Morgan Freeman", character: "Ellis Boyd 'Red' Redding", profilePath: "/fSM91HAlAOOOXoBqzDyW4Ns7FpZ.jpg" },
    ],
    crew: [
      { id: 3, name: "Frank Darabont", job: "Director", department: "Directing", profilePath: "/pLCdFcRQfDfubEvJSmhBZQq3lJx.jpg" },
    ],
    videos: [
      { id: "1", key: "PLl99DlL6b4", name: "Official Trailer", site: "YouTube", type: "Trailer" },
    ],
    images: {
      backdrops: [{ filePath: "/xBKGJQsAIeweesB79KC89FpBrVr.jpg" }],
      posters: [{ filePath: "/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg" }],
    },
    keywords: [{ id: 1, name: "prison" }, { id: 2, name: "friendship" }, { id: 3, name: "hope" }],
    recommendations: {
      results: [
        { id: 238, title: "The Godfather", posterPath: "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg", voteAverage: 9.2 },
        { id: 424, title: "Schindler's List", posterPath: "/sF1U4EUQS8YHUYjNl3pGWJmGJYU.jpg", voteAverage: 8.9 },
      ],
    },
    similar: {
      results: [
        { id: 238, title: "The Godfather", posterPath: "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg", voteAverage: 9.2 },
        { id: 603, title: "The Matrix", posterPath: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg", voteAverage: 8.7 },
      ],
    },
    watchProviders: {
      results: {
        US: {
          link: "https://www.themoviedb.org/movie/278/watch",
          flatrate: [
            { provider_id: 8, provider_name: "Netflix", logo_path: "/t2yyOv40HZeVlLjY0sPHtYzGJgS.jpg", display_priority: 1 },
            { provider_id: 119, provider_name: "Amazon Prime Video", logo_path: "/aE11n3fF6W4f2QfVn4nQJ5Q6Q7Q.jpg", display_priority: 2 },
          ],
          rent: [
            { provider_id: 3, provider_name: "Apple TV", logo_path: "/9rR2n4QJ5Q6Q7Q8Q9Q0Q1Q2Q3Q.jpg", display_priority: 1 },
            { provider_id: 2, provider_name: "Google Play Movies", logo_path: "/aE11n3fF6W4f2QfVn4nQJ5Q6Q7Q.jpg", display_priority: 2 },
          ],
          buy: [
            { provider_id: 3, provider_name: "Apple TV", logo_path: "/9rR2n4QJ5Q6Q7Q8Q9Q0Q1Q2Q3Q.jpg", display_priority: 1 },
            { provider_id: 2, provider_name: "Google Play Movies", logo_path: "/aE11n3fF6W4f2QfVn4nQJ5Q6Q7Q.jpg", display_priority: 2 },
          ],
        },
        GB: {
          link: "https://www.themoviedb.org/movie/278/watch",
          flatrate: [
            { provider_id: 8, provider_name: "Netflix", logo_path: "/t2yyOv40HZeVlLjY0sPHtYzGJgS.jpg", display_priority: 1 },
          ],
          rent: [
            { provider_id: 3, provider_name: "Apple TV", logo_path: "/9rR2n4QJ5Q6Q7Q8Q9Q0Q1Q2Q3Q.jpg", display_priority: 1 },
            { provider_id: 35, provider_name: "Amazon Video", logo_path: "/aE11n3fF6W4f2QfVn4nQJ5Q6Q7Q.jpg", display_priority: 2 },
          ],
          buy: [
            { provider_id: 3, provider_name: "Apple TV", logo_path: "/9rR2n4QJ5Q6Q7Q8Q9Q0Q1Q2Q3Q.jpg", display_priority: 1 },
          ],
        },
      },
    },
  };
}

function getMockSearchResults(query: string): MovieMatch[] {
  const movies: MovieMatch[] = [
    {
      id: "tt0111161",
      title: "The Shawshank Redemption",
      year: 1994,
      overview: "Two imprisoned men bond over a number of years...",
      posterPath: "/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg",
      backdropPath: "/xBKGJQsAIeweesB79KC89FpBrVr.jpg",
      voteAverage: 9.3,
      voteCount: 2500000,
      genreIds: [18, 80],
      confidence: 0.95,
      matchType: "exact",
    },
    {
      id: "tt0068646",
      title: "The Godfather",
      year: 1972,
      overview: "The aging patriarch of an organized crime dynasty...",
      posterPath: "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg",
      backdropPath: "/tmU7GeKVybMWFButWEGl2M4GeiP.jpg",
      voteAverage: 9.2,
      voteCount: 1800000,
      genreIds: [18, 80],
      confidence: 0.87,
      matchType: "high",
    },
    {
      id: "tt0468569",
      title: "The Dark Knight",
      year: 2008,
      overview: "When the menace known as the Joker wreaks havoc...",
      posterPath: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
      backdropPath: "/nMkZJBWW9j4QM5v3F2fPrq3gf0T.jpg",
      voteAverage: 9.0,
      voteCount: 2800000,
      genreIds: [28, 80, 18, 53],
      confidence: 0.72,
      matchType: "medium",
    },
    {
      id: "tt0137523",
      title: "Fight Club",
      year: 1999,
      overview: "An insomniac office worker and a devil-may-care soapmaker form an underground fight club...",
      posterPath: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
      backdropPath: "/hZkgoQYus5vegHoetLkCJzb19zJ.jpg",
      voteAverage: 8.8,
      voteCount: 2200000,
      genreIds: [18],
      confidence: 0.68,
      matchType: "medium",
    },
    {
      id: "tt0109830",
      title: "Forrest Gump",
      year: 1994,
      overview: "The presidencies of Kennedy and Johnson, the Vietnam War, the Watergate scandal...",
      posterPath: "/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg",
      backdropPath: "/cqH3u6Iy3J8Y9vq8Y0gKfRnQkGq.jpg",
      voteAverage: 8.8,
      voteCount: 2000000,
      genreIds: [18, 10749],
      confidence: 0.65,
      matchType: "medium",
    },
  ];

  if (query) {
    const q = query.toLowerCase();
    return movies.filter((m) =>
      m.title.toLowerCase().includes(q) ||
      m.overview?.toLowerCase().includes(q)
    );
  }

  return movies;
}

export const TMDB_GENRES = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Science Fiction" },
  { id: 10770, name: "TV Movie" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" },
] as const;