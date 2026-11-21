import { MongoClient } from 'mongodb';

const testUris = [
  process.env.MONGODB_TEST_URI ??
    'mongodb://localhost:27017/nextask_phase2_test?directConnection=true',
  process.env.MONGODB_MIGRATION_TEST_URI ??
    'mongodb://localhost:27017/nextask_phase2_migration_test?directConnection=true',
  'mongodb://localhost:27017/nextask_phase0_test?directConnection=true',
  'mongodb://localhost:27017/nextask_explain_v6?directConnection=true',
];

async function dropDatabase(uri: string): Promise<void> {
  const client = new MongoClient(uri);
  await client.connect();
  try {
    await client.db().dropDatabase();
  } finally {
    await client.close();
  }
}

export default async function setup() {
  await Promise.all(testUris.map(dropDatabase));
  return async () => {
    await Promise.all(testUris.map(dropDatabase));
  };
}
