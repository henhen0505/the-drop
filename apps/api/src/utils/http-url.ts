import { z } from 'zod';

const MAX_URL_LENGTH = 2048;

/**
 * z.string().url() accepts any scheme, including javascript: and data:, and these values end up
 * as hrefs and image sources shown to other users. Only http(s) is allowed.
 */
export const httpUrl = z
  .string()
  .trim()
  .max(MAX_URL_LENGTH)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), { message: 'URL must start with http:// or https://' });
