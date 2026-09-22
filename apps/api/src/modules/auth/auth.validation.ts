import { z } from 'zod';

export const registerSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
    displayName: z.string().min(1).max(100),
  }),
};

export const loginSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
};

export const googleSchema = {
  body: z.object({
    idToken: z.string().min(1),
  }),
};

export const forgotPasswordSchema = {
  body: z.object({
    email: z.string().email(),
  }),
};

export const resetPasswordSchema = {
  body: z.object({
    token: z.string().min(1),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
  }),
};
