import { z } from "zod";

export const HookInputSchema = z.object({
  topic: z.string().min(3).max(200),
  platform: z.enum(["TikTok", "Instagram", "YouTube Shorts", "Facebook"]),
  tone: z.enum([
    "Shocking",
    "Curious",
    "Funny",
    "Motivational",
    "Controversial",
    "Educational",
  ]),
});

export type HookInput = z.infer<typeof HookInputSchema>;
