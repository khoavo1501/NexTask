/* global process, rs, db, sleep, printjson */

const rootUser = process.env.MONGO_ROOT_USERNAME;
const rootPassword = process.env.MONGO_ROOT_PASSWORD;
const appUser = process.env.MONGO_APP_USERNAME;
const appPassword = process.env.MONGO_APP_PASSWORD;

if (!rootUser || !rootPassword || !appUser || !appPassword) {
  throw new Error('Thiếu biến bootstrap Mongo');
}

try {
  rs.status();
} catch {
  rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'mongo:27017' }],
  });
}

for (let attempt = 0; attempt < 50 && !db.hello().isWritablePrimary; attempt += 1) {
  sleep(200);
}
if (!db.hello().isWritablePrimary) {
  throw new Error('Mongo replica set chưa có primary');
}

const admin = db.getSiblingDB('admin');
if (!admin.getUser(rootUser)) {
  admin.createUser({ user: rootUser, pwd: rootPassword, roles: ['root'] });
}
if (!admin.getUser(appUser)) {
  admin.createUser({
    user: appUser,
    pwd: appPassword,
    roles: [
      { role: 'readWrite', db: 'nextask' },
      { role: 'dbAdmin', db: 'nextask' },
    ],
  });
}

printjson({ ok: true, primary: db.hello().isWritablePrimary, appUser });
