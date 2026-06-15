import { z } from "zod";

export const AddAccountSchema = z.object({
  platform: z.enum(["TikTok", "Instagram", "YouTube", "Facebook"]),
  displayName: z.string().min(1, "Add your page name or @handle").max(120),
  profileUrl: z.url("Enter a valid URL").max(500).optional().or(z.literal("")),
});

export type AddAccountInput = z.infer<typeof AddAccountSchema>;

export const RemoveAccountSchema = z.object({
  id: z.uuid(),
});
