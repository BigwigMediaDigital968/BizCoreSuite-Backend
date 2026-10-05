import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),

  password: z
    .string()
    .min(8)
    .max(128)
});

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

/**
 * Admin/Head reset of someone else's password. There is no current password to
 * verify here — the actor's USER_UPDATE permission is the authorization.
 */
export const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8).max(128),
  })
  .strict();