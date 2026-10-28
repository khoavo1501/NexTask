import { z } from 'zod';

const mongoUriSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
    'MONGODB_URI phải bắt đầu bằng mongodb:// hoặc mongodb+srv://',
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  MONGODB_URI: mongoUriSchema,
  MONGODB_REPLICA_SET: z.string().min(1).default('rs0'),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SERVICE_VERSION: z.string().min(1).default('0.1.0'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET phải dài ít nhất 32 ký tự'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SEED_OWNER_EMAIL: z.string().email().optional(),
  SEED_OWNER_PASSWORD: z.string().min(12).optional(),
  SEED_OWNER_NAME: z.string().min(1).max(80).default('Demo Owner'),
  DEMO_OWNER_ID: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, 'DEMO_OWNER_ID phải là ObjectId 24 ký tự')
    .default('000000000000000000000001'),
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
