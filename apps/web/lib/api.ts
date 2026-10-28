import {
  apiErrorSchema,
  boardResponseSchema,
  boardsResponseSchema,
  itemsResponseSchema,
  promoteResponseSchema,
  taskResponseSchema,
  tasksResponseSchema,
  type BoardDto,
  type CreateBoardRequest,
  type ItemDto,
  type MoveTaskRequest,
  type PromoteRequest,
  type SyncItemInput,
  type TaskDto,
} from '@nextask/contracts';
import type { z } from 'zod';

const browserApiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(
  /\/$/,
  '',
);

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`${browserApiBase}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const json: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(json);
    if (parsed.success) {
      throw new ApiClientError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.details,
      );
    }
    throw new ApiClientError(response.status, 'UNKNOWN_ERROR', 'API trả lỗi không xác định');
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError(500, 'INVALID_RESPONSE', 'Phản hồi API không đúng hợp đồng');
  }
  return parsed.data;
}

export async function listBoards(): Promise<BoardDto[]> {
  return (await request('/boards', boardsResponseSchema)).data;
}

export async function createBoard(input: CreateBoardRequest): Promise<BoardDto> {
  return (
    await request('/boards', boardResponseSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).data;
}

export async function getBoard(boardId: string): Promise<BoardDto> {
  return (await request(`/boards/${boardId}`, boardResponseSchema)).data;
}

export async function getItems(boardId: string): Promise<ItemDto[]> {
  return (await request(`/boards/${boardId}/items`, itemsResponseSchema)).data;
}

export async function syncItems(boardId: string, items: SyncItemInput[]): Promise<ItemDto[]> {
  return (
    await request(`/boards/${boardId}/items`, itemsResponseSchema, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    })
  ).data;
}

export async function getTasks(boardId: string): Promise<TaskDto[]> {
  return (await request(`/boards/${boardId}/tasks`, tasksResponseSchema)).data;
}

export async function promoteItem(
  boardId: string,
  itemId: string,
  input: PromoteRequest,
): Promise<{ item: ItemDto; task: TaskDto }> {
  return (
    await request(`/boards/${boardId}/items/${itemId}/promote`, promoteResponseSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).data;
}

export async function moveTask(
  boardId: string,
  taskId: string,
  input: MoveTaskRequest,
): Promise<TaskDto> {
  return (
    await request(`/boards/${boardId}/tasks/${taskId}`, taskResponseSchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  ).data;
}
