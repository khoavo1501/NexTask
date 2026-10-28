import { boardsResponseSchema, type BoardDto } from '@nextask/contracts';

const serverApiBase = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000/api/v1').replace(
  /\/$/,
  '',
);

export async function fetchBoardsServer(): Promise<BoardDto[]> {
  const response = await fetch(`${serverApiBase}/boards`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`API trả HTTP ${response.status}`);
  }
  const parsed = boardsResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('Phản hồi danh sách board không đúng hợp đồng');
  }
  return parsed.data.data;
}
