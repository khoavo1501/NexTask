import {
  apiErrorSchema,
  boardMembersResponseSchema,
  boardResponseSchema,
  boardsResponseSchema,
  createInvitationRequestSchema,
  createTaskRequestSchema,
  invitationAcceptResponseSchema,
  invitationCreateResponseSchema,
  itemsResponseSchema,
  loginRequestSchema,
  promoteResponseSchema,
  registerRequestSchema,
  renameBoardRequestSchema,
  syncItemsRequestSchema,
  taskResponseSchema,
  tasksListResponseSchema,
  updateColumnsRequestSchema,
  updateTaskRequestSchema,
  userResponseSchema,
  type BoardDto,
  type BoardMemberDetailDto,
  type CreateBoardRequest,
  type CreateInvitationRequest,
  type CreateTaskRequest,
  type ItemDto,
  type LoginRequest,
  type MoveTaskRequest,
  type PromoteRequest,
  type RegisterRequest,
  type RenameBoardRequest,
  type SyncDeletedItemInput,
  type SyncItemInput,
  type TaskDto,
  type TaskPriority,
  type UpdateColumnsRequest,
  type UpdateTaskRequest,
  type UserDto,
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

export function isVersionConflict(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && error.code === 'VERSION_CONFLICT';
}

export function isOrderConflict(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && error.code === 'ORDER_CONFLICT';
}

export function isColumnNotEmpty(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && error.code === 'COLUMN_NOT_EMPTY';
}

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`${browserApiBase}${path}`, {
    ...init,
    headers,
    credentials: 'include',
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

async function parseApiError(response: Response): Promise<never> {
  const json: unknown = await response.json().catch(() => null);
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

export async function register(input: RegisterRequest): Promise<UserDto> {
  const body = registerRequestSchema.parse(input);
  return (
    await request('/auth/register', userResponseSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  ).data;
}

export async function login(input: LoginRequest): Promise<UserDto> {
  const body = loginRequestSchema.parse(input);
  return (
    await request('/auth/login', userResponseSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  ).data;
}

export async function logout(): Promise<void> {
  const response = await fetch(`${browserApiBase}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) {
    await parseApiError(response);
  }
}

export async function getMe(): Promise<UserDto> {
  return (await request('/auth/me', userResponseSchema)).data;
}

export async function listBoards(): Promise<BoardDto[]> {
  return (await request('/boards', boardsResponseSchema)).data;
}

export async function renameBoard(
  boardId: string,
  name: string,
  expectedVersion: number,
): Promise<BoardDto> {
  const body: RenameBoardRequest = renameBoardRequestSchema.parse({ name, expectedVersion });
  return (
    await request(`/boards/${boardId}`, boardResponseSchema, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  ).data;
}

export async function createInvitation(
  boardId: string,
  email?: string,
): Promise<{ token: string; path: string; expiresAt: string }> {
  const body: CreateInvitationRequest = createInvitationRequestSchema.parse(email ? { email } : {});
  return (
    await request(`/boards/${boardId}/invitations`, invitationCreateResponseSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  ).data;
}

export async function acceptInvitation(token: string): Promise<BoardDto> {
  return (
    await request(
      `/invitations/${encodeURIComponent(token)}/accept`,
      invitationAcceptResponseSchema,
      {
        method: 'POST',
      },
    )
  ).data;
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

export async function syncItems(
  boardId: string,
  items: SyncItemInput[],
  deleted: SyncDeletedItemInput[],
): Promise<ItemDto[]> {
  const body = syncItemsRequestSchema.parse({ items, deleted });
  return (
    await request(`/boards/${boardId}/items`, itemsResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  ).data;
}

export async function getTasks(
  boardId: string,
  filters: TaskListFilters = {},
): Promise<{ tasks: TaskDto[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.columnId) params.set('columnId', filters.columnId);
  if (filters.labels) params.set('labels', filters.labels);
  if (filters.limit) params.set('limit', String(filters.limit));

  const suffix = params.toString() ? `?${params.toString()}` : '';
  const body = await request(`/boards/${boardId}/tasks${suffix}`, tasksListResponseSchema);
  return { tasks: body.data, hasMore: body.meta.hasMore };
}

export async function getBoardMembers(boardId: string): Promise<BoardMemberDetailDto[]> {
  return (await request(`/boards/${boardId}/members`, boardMembersResponseSchema)).data;
}

export async function updateColumns(
  boardId: string,
  input: UpdateColumnsRequest,
): Promise<BoardDto> {
  const body = updateColumnsRequestSchema.parse(input);
  return (
    await request(`/boards/${boardId}/columns`, boardResponseSchema, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  ).data;
}

export async function createTask(boardId: string, input: CreateTaskRequest): Promise<TaskDto> {
  const body = createTaskRequestSchema.parse(input);
  return (
    await request(`/boards/${boardId}/tasks`, taskResponseSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  ).data;
}

export async function updateTask(
  boardId: string,
  taskId: string,
  input: UpdateTaskRequest,
): Promise<TaskDto> {
  const body = updateTaskRequestSchema.parse(input);
  return (
    await request(`/boards/${boardId}/tasks/${taskId}`, taskResponseSchema, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  ).data;
}

export interface TaskListFilters {
  q?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  columnId?: string;
  labels?: string;
  limit?: number;
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
    await request(`/boards/${boardId}/tasks/${taskId}/move`, taskResponseSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).data;
}
