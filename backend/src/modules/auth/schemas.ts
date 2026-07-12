import { z } from "zod";

export const registerSchema = z
  .object({
    email: z.string().trim().email().max(255),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
    name: z.string().trim().min(1).max(200)
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
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

export const primaryAddressSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the full name for delivery.").max(200),
  phone: z.string().trim().min(10, "Enter a valid mobile number.").max(20),
  line1: z.string().trim().min(4, "Enter a complete street address.").max(300),
  line2: z
    .string()
    .trim()
    .max(300)
    .optional()
    .nullable()
    .transform((value) => (value === "" ? null : value)),
  city: z.string().trim().min(2, "Enter your city.").max(120),
  state: z.string().trim().min(1, "Enter your state.").max(120),
  postalCode: z.string().trim().min(1, "Enter your PIN / postal code.").max(20),
  country: z.string().trim().length(2, "Choose a valid country.").default("IN")
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(200),
  phone: z
    .string()
    .trim()
    .min(10, "Enter a valid 10-digit mobile number.")
    .max(20),
  address: primaryAddressSchema
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128)
});

export const setPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128)
});

export const notificationPreferencesSchema = z.object({
  emailNotificationsEnabled: z.boolean().optional(),
  pushNotificationsEnabled: z.boolean().optional()
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type SendOtpBody = z.infer<typeof sendOtpSchema>;
export type VerifyOtpBody = z.infer<typeof verifyOtpSchema>;
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
export type SetPasswordBody = z.infer<typeof setPasswordSchema>;
export type NotificationPreferencesBody = z.infer<
  typeof notificationPreferencesSchema
>;
