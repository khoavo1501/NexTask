const expectedReplicaSet = 'rs0';
const deadline = Date.now() + 60_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  while (true) {
    try {
      db.adminCommand({ ping: 1 });
      break;
    } catch (error) {
      if (Date.now() > deadline) {
        throw new Error(`MongoDB không phản hồi: ${error.message}`);
      }
      await sleep(1_000);
    }
  }

  let initialized = false;
  try {
    const status = rs.status();
    initialized = status.ok === 1;
  } catch {
    initialized = false;
  }

  if (!initialized) {
    rs.initiate({
      _id: expectedReplicaSet,
      members: [{ _id: 0, host: 'mongo:27017' }],
    });
  }

  while (true) {
    const hello = db.adminCommand({ hello: 1 });
    if (hello.setName === expectedReplicaSet && hello.isWritablePrimary === true) {
      break;
    }
    if (Date.now() > deadline) {
      throw new Error('Replica set chưa có primary');
    }
    await sleep(500);
  }

  print(`replica set ${expectedReplicaSet} ready`);
}

main().catch((error) => {
  print(error);
  quit(1);
});
