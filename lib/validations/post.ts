import { z } from "zod";

export const PostInputSchema = z
  .object({
    clipId: z.uuid().optional(),
    videoId: z.uuid().optional(),
    platforms: z
      .array(z.enum(["TikTok", "Instagram", "YouTube", "Facebook"]))
      .min(1),
    caption: z.string().max(2200),
    scheduledAt: z.iso.datetime().optional(),
  })
  .refine((data) => Boolean(data.clipId || data.videoId), {
    message: "Provide a clipId or a videoId.",
    path: ["clipId"],
  });

export type PostInput = z.infer<typeof PostInputSchema>;
