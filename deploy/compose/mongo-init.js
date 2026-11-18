// Runs once, when the database volume is first created: the application
// user (read/write on the application database only).
const admin = db.getSiblingDB('admin');
admin.createUser({
  user: process.env.TB_MONGO_USER,
  pwd: process.env.TB_MONGO_PASSWORD,
  roles: [{ role: 'readWrite', db: process.env.TB_DB_NAME }],
});
