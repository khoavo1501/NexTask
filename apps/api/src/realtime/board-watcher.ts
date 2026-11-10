import type { RealtimeEvent } from '@nextask/contracts';
import type { ChangeStream, ChangeStreamDocument, Document } from 'mongodb';
import type { Connection } from 'mongoose';
import { Types } from 'mongoose';
import type { Logger } from '../lib/logger.js';
import {
  loadResumeToken,
  saveResumeToken,
  type CheckpointCollection,
} from './checkpoint.service.js';
import { mapChangeToEvent } from './event-mapper.js';

export interface BoardWatcherOptions {
  connection: Connection;
  boardId: string;
  logger: Logger;
  onEvent: (event: RealtimeEvent) => void;
  onResync: (reason: 'oplog_lost' | 'watcher_error') => void;
  graceMs?: number;
}

function isHistoryLost(error: unknown): boolean {
  return (error as { code?: number }).code === 286;
}

export class BoardWatcher {
  private readonly options: BoardWatcherOptions;
  private readonly streams = new Map<CheckpointCollection, ChangeStream<Document>>();
  private refs = 0;
  private started = false;
  private starting: Promise<void> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly retried = new Set<CheckpointCollection>();

  constructor(options: BoardWatcherOptions) {
    this.options = { ...options, graceMs: options.graceMs ?? 5_000 };
  }

  async acquire(): Promise<void> {
    this.refs += 1;
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (!this.started && !this.starting) {
      this.starting = this.openAll().finally(() => {
        this.starting = null;
      });
    }
    await this.starting;
  }

  release(): void {
    this.refs = Math.max(0, this.refs - 1);
    if (this.refs > 0) return;
    this.closeTimer = setTimeout(() => {
      void this.close();
    }, this.options.graceMs);
  }

  async close(): Promise<void> {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.refs = 0;
    this.started = false;
    await Promise.all([...this.streams.keys()].map((collection) => this.closeStream(collection)));
  }

  private async openAll(): Promise<void> {
    this.started = true;
    await Promise.all(
      (['items', 'tasks'] as const).map((collection) => this.startStream(collection)),
    );
  }

  private pipeline() {
    const boardId = new Types.ObjectId(this.options.boardId);
    return [
      {
        $match: {
          operationType: { $in: ['insert', 'update', 'replace', 'delete'] },
          $or: [
            { 'fullDocument.boardId': boardId },
            { 'fullDocumentBeforeChange.boardId': boardId },
          ],
        },
      },
      {
        $project: {
          operationType: 1,
          fullDocument: 1,
          fullDocumentBeforeChange: 1,
          documentKey: 1,
          clusterTime: 1,
        },
      },
    ];
  }

  private async startStream(collection: CheckpointCollection, useCheckpoint = true): Promise<void> {
    const db = this.options.connection.db;
    if (!db) throw new Error('MongoDB connection is not ready');

    const resumeToken = useCheckpoint
      ? await loadResumeToken(this.options.connection, this.options.boardId, collection)
      : null;
    const stream = db.collection(collection).watch<Document>(this.pipeline(), {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable',
      ...(resumeToken ? { resumeAfter: resumeToken } : {}),
    });

    stream.on('change', (change) => {
      void this.handleChange(collection, change);
    });
    stream.on('error', (error) => {
      void this.handleError(collection, error);
    });
    this.streams.set(collection, stream);
  }

  private async handleChange(
    collection: CheckpointCollection,
    change: ChangeStreamDocument<Document>,
  ): Promise<void> {
    const event = mapChangeToEvent(collection, change, this.options.boardId);
    if (!event) return;

    try {
      this.options.onEvent(event);
      await saveResumeToken(
        this.options.connection,
        this.options.boardId,
        collection,
        change._id as Document,
      );
    } catch (error) {
      this.options.logger.error({ err: error, collection }, 'Realtime event handling failed');
    }
  }

  private async handleError(collection: CheckpointCollection, error: unknown): Promise<void> {
    this.options.logger.error({ err: error, collection }, 'Change stream error');
    await this.closeStream(collection);

    if (isHistoryLost(error)) {
      this.options.onResync('oplog_lost');
      await this.startStream(collection, false);
      return;
    }

    if (!this.retried.has(collection)) {
      this.retried.add(collection);
      await this.startStream(collection);
      return;
    }

    this.options.onResync('watcher_error');
  }

  private async closeStream(collection: CheckpointCollection): Promise<void> {
    const stream = this.streams.get(collection);
    if (!stream) return;
    this.streams.delete(collection);
    stream.removeAllListeners();
    await stream.close();
  }
}

export function createBoardWatcher(options: BoardWatcherOptions): BoardWatcher {
  return new BoardWatcher(options);
}
