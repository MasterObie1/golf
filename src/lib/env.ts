import { z } from "zod";

const envSchema = z.object({
  SESSION_SECRET: z.string()
    .min(32, "SESSION_SECRET must be at least 32 characters")
    .refine(val => val !== "CHANGE-ME-generate-a-random-secret", {
      message: "SESSION_SECRET is still set to the default placeholder. Generate one with: openssl rand -base64 32",
    }),
  DATABASE_URL: z.string().optional(),
  TURSO_DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function validateEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Environment validation failed:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    throw new Error("Invalid environment configuration. See errors above.");
  }

  cachedEnv = result.data;
  return cachedEnv;
}
