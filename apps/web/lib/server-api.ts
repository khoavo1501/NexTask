import { boardsResponseSchema, type BoardDto } from '@nextask/contracts';

const serverApiBase = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000/api/v1').replace(
  /\/$/,
  '',
);

export class ServerApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ServerApiError';
  }
}

export async function fetchBoardsServer(cookieHeader: string): Promise<BoardDto[]> {
  const response = await fetch(`${serverApiBase}/boards`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new ServerApiError(response.status, `API trả HTTP ${response.status}`);
  }
  const parsed = boardsResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ServerApiError(500, 'Phản hồi danh sách board không đúng hợp đồng');
  }
  return parsed.data.data;
}
