import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(200)
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128)
});

export const sendOtpSchema = z.object({
  target: z.string().trim().min(3).max(255)
});

export const verifyOtpSchema = z.object({
  target: z.string().trim().min(3).max(255),
  code: z.string().regex(/^\d{6}$/, "Must be a 6-digit code")
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable()
    .transform((value) => (value === "" ? null : value))
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type SendOtpBody = z.infer<typeof sendOtpSchema>;
export type VerifyOtpBody = z.infer<typeof verifyOtpSchema>;
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
