import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4010),
  MONGODB_URI: z.string().min(1),
  FRONTEND_URL: z.string().url(),
  ADMIN_FRONTEND_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(16),
  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(1),
  X_CLIENT_ID: z.string().min(1),
  X_CLIENT_SECRET: z.string().min(1),
  X_CALLBACK_URL: z.string().url(),
  CRAWLER_SOURCE_URL: z.string().url().default("https://samplelib.com/sample-mp4.html"),
  CRAWLER_INTERVAL_MS: z.coerce.number().default(15 * 60 * 1000),
  QR_TIMEOUT_MS: z.coerce.number().default(5 * 60 * 1000),
});

export const env = envSchema.parse(process.env);
