import { createHash } from 'node:crypto';
import type { Document } from 'mongodb';
import type { Connection } from 'mongoose';
import { Types } from 'mongoose';

export type CheckpointCollection = 'items' | 'tasks';

export async function loadResumeToken(
  connection: Connection,
  boardId: string,
  collection: CheckpointCollection,
): Promise<Document | null> {
  const db = connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const document = await db.collection('change_stream_checkpoints').findOne({
    boardId: new Types.ObjectId(boardId),
    collection,
  });
  return (document?.token as Document | undefined) ?? null;
}

export async function saveResumeToken(
  connection: Connection,
  boardId: string,
  collection: CheckpointCollection,
  token: Document,
): Promise<void> {
  const db = connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  await db.collection('change_stream_checkpoints').updateOne(
    { boardId: new Types.ObjectId(boardId), collection },
    {
      $set: { token, updatedAt: new Date() },
      $setOnInsert: { boardId: new Types.ObjectId(boardId), collection },
    },
    { upsert: true },
  );
}

export function eventIdFromToken(token: Document): string {
  return createHash('sha256').update(JSON.stringify(token)).digest('hex');
}
