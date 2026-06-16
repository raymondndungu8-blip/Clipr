import { z } from "zod";

export const SignupSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(6).max(200),
  displayName: z.string().trim().min(1).max(80).optional(),
});

export type SignupInput = z.infer<typeof SignupSchema>;
