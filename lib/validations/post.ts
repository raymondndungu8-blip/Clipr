import { z } from "zod";

export const PostInputSchema = z
  .object({
    clipId: z.uuid().optional(),
    videoId: z.uuid().optional(),
    /** Platform names — used when no specific accounts are chosen. */
    platforms: z
      .array(z.enum(["TikTok", "Instagram", "YouTube", "Facebook"]))
      .optional(),
    /** Specific connected Zernio account ids to post to (preferred). */
    accountIds: z.array(z.string().min(1)).optional(),
    caption: z.string().max(2200),
    scheduledAt: z.iso.datetime().optional(),
  })
  .refine((data) => Boolean(data.clipId || data.videoId), {
    message: "Provide a clipId or a videoId.",
    path: ["clipId"],
  })
  .refine(
    (data) =>
      (data.platforms?.length ?? 0) > 0 || (data.accountIds?.length ?? 0) > 0,
    {
      message: "Select at least one account or platform.",
      path: ["accountIds"],
    }
  );

export type PostInput = z.infer<typeof PostInputSchema>;
