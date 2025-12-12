import { CapacitorSQLite } from "@capacitor-community/sqlite";

let dbReady: Promise<void> | null = null;
const DATABASE_NAME = "chatapp";

export const dbInit = () => {
  if (dbReady) return dbReady;

  dbReady = (async () => {
    const isEncrypted = await CapacitorSQLite.isSecretStored();
    if (!isEncrypted.result) {
      await CapacitorSQLite.setEncryptionSecret({
        passphrase: "your-pass-phrase",
      });
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
        CREATE TABLE IF NOT EXISTS TEST(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          text TEXT
        );
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

export const executeDB = async (sql: string) => {
  await dbInit();
  await CapacitorSQLite.execute({
    database: DATABASE_NAME,
    statements: sql,
  });
};
