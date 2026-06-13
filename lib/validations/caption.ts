import { z } from "zod";

export const CaptionInputSchema = z.object({
  script: z.string().min(10).max(2000),
  style: z.enum([
    "Bold Gold",
    "Pure White",
    "Fire Red",
    "Neon Green",
    "Ice Blue",
  ]),
});

export type CaptionInput = z.infer<typeof CaptionInputSchema>;
