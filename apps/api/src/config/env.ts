import { z } from 'zod';

const mongoUriSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
    'MONGODB_URI phải bắt đầu bằng mongodb:// hoặc mongodb+srv://',
  );

const DEV_JWT_SECRET = 'local-dev-only-nextask-jwt-secret-change-me';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    MONGODB_URI: mongoUriSchema,
    MONGODB_REPLICA_SET: z.string().min(1).default('rs0'),
    CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SERVICE_VERSION: z.string().min(1).default('0.1.0'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET phải dài ít nhất 32 ký tự'),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(5),
    SEED_OWNER_EMAIL: z.string().email().optional(),
    SEED_OWNER_PASSWORD: z.string().min(12).optional(),
    SEED_OWNER_NAME: z.string().min(1).max(80).default('Demo Owner'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'Production phải bật COOKIE_SECURE=true',
      });
    }
    if (env.JWT_SECRET === DEV_JWT_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'Không dùng JWT_SECRET dev trên production',
      });
    }
    if (!env.CORS_ORIGIN.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGIN'],
        message: 'Production CORS_ORIGIN phải dùng https://',
      });
    }
    if (env.SEED_OWNER_EMAIL || env.SEED_OWNER_PASSWORD) {
      ctx.addIssue({
        code: 'custom',
        path: ['SEED_OWNER_EMAIL'],
        message: 'Production không seed owner demo',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${details}`);
  }
  return result.data;
}
