import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  eventIdFromToken,
  loadResumeToken,
  saveResumeToken,
} from '../src/realtime/checkpoint.service.js';
import { connectTestDb } from './helpers/test-db.js';

let connection: Awaited<ReturnType<typeof connectTestDb>>;

beforeAll(async () => {
  connection = await connectTestDb();
});

afterAll(async () => {
  await connection.close();
});

describe('checkpoints', () => {
  it('lưu/đọc token theo board/collection và hash ổn định', async () => {
    const boardId = new Types.ObjectId();
    const token = { _data: 'token-1' };

    expect(await loadResumeToken(connection, boardId.toHexString(), 'items')).toBeNull();
    await saveResumeToken(connection, boardId.toHexString(), 'items', token);
    expect(await loadResumeToken(connection, boardId.toHexString(), 'items')).toEqual(token);
    expect(await loadResumeToken(connection, boardId.toHexString(), 'tasks')).toBeNull();

    await saveResumeToken(connection, boardId.toHexString(), 'items', { _data: 'token-2' });
    expect(await loadResumeToken(connection, boardId.toHexString(), 'items')).toEqual({
      _data: 'token-2',
    });
    expect(eventIdFromToken(token)).toBe(eventIdFromToken({ _data: 'token-1' }));
    expect(eventIdFromToken(token)).not.toBe(eventIdFromToken({ _data: 'token-2' }));
  });
});
