import { healthResponseSchema, type HealthResponse } from '@nextask/contracts';

export type HealthResult =
  | { ok: true; response: HealthResponse }
  | { ok: false; message: string };

export async function fetchHealth(): Promise<HealthResult> {
  const baseUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/api/v1';

  try {
    const response = await fetch(`${baseUrl}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    const parsed = healthResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { ok: false, message: 'Phản hồi health không đúng hợp đồng' };
    }
    return { ok: true, response: parsed.data };
  } catch {
    return { ok: false, message: 'Không kết nối được API' };
  }
}
