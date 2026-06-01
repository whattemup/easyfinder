import dotenv from "dotenv";
import { z } from "zod";

// Load both the current working directory .env and the API package .env.
// This keeps direct imports of env.ts consistent whether the process starts
// from the repo root, apps/api, or a deployment builder.
dotenv.config();
dotenv.config({ path: new URL("../.env", import.meta.url), override: false });

/**
 * EasyFinder API environment validation (Zod)
 * - Fails fast with readable errors at runtime
 * - Avoids "optional integration takes down prod" footguns
 *
 * IMPORTANT:
 * - Core app (auth, listings, etc.) must boot in production even if Stripe isn't configured yet.
 * - Stripe + Resend are OPTIONAL unless explicitly enabled via BILLING_ENABLED / EMAIL_ENABLED.
 * - Vercel may import files during its build/analyze phase; skip only runtime-only
 *   required-secret validation during that phase so web deployments are not bricked
 *   by the separate Fly.io API configuration.
 */

export const isVercelBuildPhase =
  process.env.VERCEL === "1" &&
  process.env.CI === "1" &&
  process.env.EASYFINDER_FORCE_RUNTIME_VALIDATION !== "true";

const runtimeRequiredKeys = ["JWT_SECRET", "MONGO_URL", "DB_NAME"] as const;

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // Backend runtime
    PORT: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : 8080))
      .refine(
        (n) => Number.isFinite(n) && n > 0 && n < 65536,
        "PORT must be a valid port"
      ),

    // Demo Mode
    DEMO_MODE: z
      .string()
      .optional()
      .transform((v) => v === "true"),

    ADMIN_ENABLED: z
      .string()
      .optional()
      .transform((v) => (v === undefined ? true : v === "true")),
    ADMIN_EMAIL_ALLOWLIST: z.string().optional(),

    // Feature toggles (prevents optional integrations from bricking prod)
    BILLING_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    BILLING_STUB_PLAN: z.enum(["free", "pro", "enterprise"]).optional(),
    EMAIL_ENABLED: z
      .string()
      .optional()
      .transform((v) => v === "true")
      .default("true")
      .pipe(z.boolean()),

    // Security / Auth (required at runtime)
    JWT_SECRET: z
      .string()
      .min(16, "JWT_SECRET must be at least 16 characters (use a long random string)")
      .optional(),

    // CORS (comma-separated list of origins)
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:5173")
      .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
      .refine((arr) => arr.length > 0),

    // Mongo (required at runtime)
    MONGO_URL: z.string().min(1, "MONGO_URL is required").optional(),
    DB_NAME: z.string().min(1, "DB_NAME is required").optional(),

    // App base URL (used for building absolute links in emails)
    // Local: http://localhost:5173
    // Prod:  https://<your-vercel-domain>
    APP_BASE_URL: z.string().url().default("http://localhost:5173"),

    // Public API base URL (used for storing absolute image links)
    // Local: http://localhost:8080
    // Prod:  https://easyfinder.fly.dev
    PUBLIC_API_BASE_URL: z
      .string()
      .url()
      .default("http://localhost:8080")
      .transform((value) => value.replace(/\/+$/, "")),

    // Resend (for password reset emails, etc.)
    RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required").optional(),
    // Must be a verified sender in Resend, e.g. "EasyFinder <no-reply@yourdomain.com>"
    RESEND_FROM: z.string().min(1, "RESEND_FROM is required").optional(),

    // Stripe (billing)
    STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required").optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1, "STRIPE_WEBHOOK_SECRET is required").optional(),
    STRIPE_PRICE_ID_PRO: z.string().min(1, "STRIPE_PRICE_ID_PRO is required").optional(),
    STRIPE_PRICE_ID_ENTERPRISE: z
      .string()
      .min(1, "STRIPE_PRICE_ID_ENTERPRISE is required")
      .optional(),

    LAUNCH_DATE: z.string().datetime().default("2026-02-01T00:00:00.000Z"),
  })
  .superRefine((values, ctx) => {
    if (isVercelBuildPhase) return;

    for (const key of runtimeRequiredKeys) {
      if (!values[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required`,
        });
      }
    }

    if (values.NODE_ENV !== "production") return;

    // Only enforce Stripe if billing is enabled
    if (values.BILLING_ENABLED) {
      const stripeRequired = [
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_PRICE_ID_PRO",
        "STRIPE_PRICE_ID_ENTERPRISE",
      ] as const;

      for (const key of stripeRequired) {
        if (!values[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required in production when BILLING_ENABLED=true`,
          });
        }
      }
    }

    // Only enforce Resend if emails are enabled
    if (values.EMAIL_ENABLED) {
      const resendRequired = ["RESEND_API_KEY", "RESEND_FROM"] as const;
      for (const key of resendRequired) {
        if (!values[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required in production when EMAIL_ENABLED=true`,
          });
        }
      }
    }
  });

const testDefaults =
  process.env.NODE_ENV === "test"
    ? {
        JWT_SECRET: "test-secret-1234567890",
        MONGO_URL: "mongodb://localhost:27017",
        DB_NAME: "easyfinder_test",
        APP_BASE_URL: "http://localhost:5173",
        PUBLIC_API_BASE_URL: "http://localhost:8080",
        BILLING_ENABLED: "false",
        EMAIL_ENABLED: "false",
      }
    : {};

const parsed = EnvSchema.safeParse({ ...process.env, ...testDefaults });

if (!parsed.success) {
  throw new Error(
    "❌ Invalid environment variables:\n" +
      parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n") +
      "\n\nSet these in your API runtime environment. For the documented deployment split, " +
      "Vercel should build apps/web and the API runs on Fly.io. If Vercel is only " +
      "building the web app, set the Vercel project Root Directory to apps/web or " +
      "keep API runtime variables out of the web build path."
  );
}

export const env = parsed.data as typeof parsed.data & {
  JWT_SECRET: string;
  MONGO_URL: string;
  DB_NAME: string;
};
