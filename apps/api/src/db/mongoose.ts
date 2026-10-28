import mongoose, { type Connection } from 'mongoose';
import type { Logger } from '../lib/logger.js';

export interface ReplicaSetInfo {
  replicaSet: string;
  primary: boolean;
}

interface ConnectMongoOptions {
  uri: string;
  logger: Logger;
}

export async function connectMongo({ uri, logger }: ConnectMongoOptions): Promise<Connection> {
  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    autoIndex: false,
    bufferCommands: false,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
    maxPoolSize: 10,
  });

  const connection = mongoose.connection;
  connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  logger.info({ host: connection.host, name: connection.name }, 'MongoDB connected');
  return connection;
}

export async function assertReplicaSet(
  connection: Connection,
  expectedReplicaSet: string,
): Promise<ReplicaSetInfo> {
  if (!connection.db) {
    throw new Error('MongoDB connection is not ready');
  }

  const hello = (await connection.db.admin().command({ hello: 1 })) as {
    setName?: string;
    isWritablePrimary?: boolean;
  };

  if (hello.setName !== expectedReplicaSet) {
    throw new Error(
      `Expected replica set "${expectedReplicaSet}", received "${hello.setName ?? 'none'}"`,
    );
  }

  return {
    replicaSet: hello.setName,
    primary: hello.isWritablePrimary === true,
  };
}
