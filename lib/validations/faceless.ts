import { z } from "zod";

const TOPIC_REGEX = /^[\w\s.,!?'–-]+$/;

export const FacelessInputSchema = z.object({
  topic: z.string().min(3).max(200).regex(TOPIC_REGEX),
  niche: z.enum([
    "Tech & AI",
    "Business",
    "Finance",
    "Health",
    "Motivation",
    "News",
    "Kenyan Content",
    "Entertainment",
  ]),
  voice: z.enum([
    "Authoritative",
    "Conversational",
    "Hype",
    "Calm",
    "Storytelling",
  ]),
  duration: z.enum(["30s", "45s", "60s", "90s"]),
  platforms: z
    .array(z.enum(["TikTok", "Instagram", "YouTube", "Facebook"]))
    .min(1)
    .max(4),
});

export type FacelessInput = z.infer<typeof FacelessInputSchema>;
