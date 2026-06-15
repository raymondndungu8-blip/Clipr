import { z } from "zod";

export const ALLOWED_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "facebook.com",
  "fb.watch",
] as const;

const TOPIC_REGEX = /^[\w\s.,!?'–-]+$/;

export const ClipInputSchema = z
  .object({
    url: z
      .url()
      .refine((value) => {
        try {
          const hostname = new URL(value).hostname.replace(/^www\./, "");
          return ALLOWED_DOMAINS.some(
            (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
          );
        } catch {
          return false;
        }
      }, "URL must be a YouTube or Facebook video link")
      .optional(),
    topic: z.string().min(3).max(200).regex(TOPIC_REGEX).optional(),
    style: z.enum([
      "Educational",
      "Motivational",
      "Entertainment",
      "Comedy",
      "News",
    ]),
    platforms: z
      .array(z.enum(["TikTok", "Instagram", "YouTube", "Facebook"]))
      .min(1)
      .max(4),
    /** How many shorts/reels to clip (default 3). */
    count: z.coerce.number().int().min(1).max(6).optional(),
  })
  .refine((data) => Boolean(data.url || data.topic), {
    message: "Provide a video URL or a topic.",
    path: ["url"],
  });

export type ClipInput = z.infer<typeof ClipInputSchema>;
