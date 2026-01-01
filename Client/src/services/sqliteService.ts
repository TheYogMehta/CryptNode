import { CapacitorSQLite } from "@capacitor-community/sqlite";
import { getKeyFromSecureStorage } from "./SafeStorage";

let dbReady: Promise<void> | null = null;
const DATABASE_NAME = "chatapp";

export const dbInit = () => {
  if (dbReady) return dbReady;
  dbReady = (async () => {
    const isEncrypted = await CapacitorSQLite.isSecretStored();
    if (!isEncrypted.result) {
      const key = await getKeyFromSecureStorage("MASTER_KEY");
      if (key) await CapacitorSQLite.setEncryptionSecret({ passphrase: key });
    }

    try {
      await CapacitorSQLite.createConnection({
        database: DATABASE_NAME,
        encrypted: true,
        mode: "secret",
        version: 1,
      });
    } catch {}

    await CapacitorSQLite.open({ database: DATABASE_NAME });
    await CapacitorSQLite.execute({
      database: DATABASE_NAME,
      statements: `
        CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY, keyJWK TEXT, status TEXT);
        CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, sid TEXT, sender TEXT, text TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);
      `,
    });
  })();
  return dbReady;
};

export const queryDB = async (sql: string, values: any[] = []) => {
  await dbInit();
  const res = await CapacitorSQLite.query({
    database: DATABASE_NAME,
    statement: sql,
    values,
  });
  return res?.values ?? [];
};

export const executeDB = async (sql: string, values: any[] = []) => {
  await dbInit();
  await CapacitorSQLite.execute({ database: DATABASE_NAME, statements: sql });
};
