import type { HealthData } from '@nextask/contracts';
import type { Connection } from 'mongoose';

type MongoReason = 'unreachable' | 'replica_set_mismatch' | 'not_primary';

export async function checkHealth(
  connection: Connection,
  expectedReplicaSet: string,
  version: string,
): Promise<HealthData> {
  const startedAt = performance.now();
  let replicaSet: string | null = null;
  let primary = false;
  let reason: MongoReason | undefined;

  try {
    if (!connection.db) {
      throw new Error('MongoDB connection is not ready');
    }
    const admin = connection.db.admin();
    await admin.command({ ping: 1 });
    const hello = (await admin.command({ hello: 1 })) as {
      setName?: string;
      isWritablePrimary?: boolean;
    };
    replicaSet = hello.setName ?? null;
    primary = hello.isWritablePrimary === true;

    if (replicaSet !== expectedReplicaSet) {
      reason = 'replica_set_mismatch';
    } else if (!primary) {
      reason = 'not_primary';
    }
  } catch {
    reason = 'unreachable';
  }

  const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
  const mongoOk = reason === undefined;

  return {
    status: mongoOk ? 'ok' : 'degraded',
    service: 'nextask-api',
    version,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      mongo: {
        status: mongoOk ? 'ok' : 'down',
        latencyMs,
        replicaSet,
        primary,
        ...(reason ? { reason } : {}),
      },
    },
  };
}
