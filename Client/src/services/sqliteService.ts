import { CapacitorSQLite } from "@capacitor-community/sqlite";
import { getKeyFromSecureStorage } from "./SafeStorage";

let dbReady: Promise<void> | null = null;
const DATABASE_NAME = "chatapp";
const SCHEMA = {
  sessions: {
    columns: "sid TEXT PRIMARY KEY UNIQUE, keyJWK TEXT, status TEXT",
    indices: [],
  },
  messages: {
    columns: `
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      sid TEXT, 
      sender TEXT, 
      text TEXT, 
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(sid) REFERENCES sessions(sid) ON DELETE CASCADE
    `,
    indices: ["CREATE INDEX IF NOT EXISTS idx_messages_sid ON messages(sid);"],
  },
};

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
      statements: "PRAGMA foreign_keys = ON;",
    });

    for (const [tableName, tableDef] of Object.entries(SCHEMA)) {
      await syncTableSchema(tableName, tableDef.columns);

      if (tableDef.indices.length > 0) {
        await CapacitorSQLite.execute({
          database: DATABASE_NAME,
          statements: tableDef.indices.join(";"),
        });
      }
    }
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

async function syncTableSchema(tableName: string, targetColumnsRaw: string) {
  const info = await CapacitorSQLite.query({
    database: DATABASE_NAME,
    statement: `PRAGMA table_info(${tableName});`,
  });

  const currentColumns = info?.values || [];
  const targetColumnsStr = targetColumnsRaw.replace(/\s+/g, " ").trim();

  if (currentColumns.length === 0) {
    await CapacitorSQLite.execute({
      database: DATABASE_NAME,
      statements: `CREATE TABLE ${tableName}(${targetColumnsStr});`,
    });
    return;
  }

  const existingNames = currentColumns.map((c: any) => c.name);
  const targetDefinitions = targetColumnsStr.split(",").map((c) => c.trim());

  const targetNames = targetDefinitions
    .filter(
      (d) =>
        !d.toUpperCase().startsWith("FOREIGN KEY") &&
        !d.toUpperCase().startsWith("CONSTRAINT")
    )
    .map((d) => d.split(" ")[0]);

  const addedColumns = targetNames.filter(
    (name) => !existingNames.includes(name)
  );
  const removedColumns = existingNames.filter(
    (name) => !targetNames.includes(name)
  );

  if (addedColumns.length > 0 && removedColumns.length === 0) {
    for (const colName of addedColumns) {
      const definition = targetDefinitions.find((d) => d.startsWith(colName));
      await CapacitorSQLite.execute({
        database: DATABASE_NAME,
        statements: `ALTER TABLE ${tableName} ADD COLUMN ${definition};`,
      });
    }
  } else if (
    removedColumns.length > 0 ||
    existingNames.length !== targetNames.length
  ) {
    const sharedColumns = existingNames
      .filter((name) => targetNames.includes(name))
      .join(", ");

    const statements = [
      `PRAGMA foreign_keys=OFF;`,
      `BEGIN TRANSACTION;`,
      `CREATE TABLE ${tableName}_new(${targetColumnsStr});`,
      ...(sharedColumns.length > 0
        ? [
            `INSERT INTO ${tableName}_new (${sharedColumns}) SELECT ${sharedColumns} FROM ${tableName};`,
          ]
        : []),
      `DROP TABLE ${tableName};`,
      `ALTER TABLE ${tableName}_new RENAME TO ${tableName};`,
      `COMMIT;`,
      `PRAGMA foreign_keys=ON;`,
    ];

    await CapacitorSQLite.execute({
      database: DATABASE_NAME,
      statements: statements.join("\n"),
    });
  }
}
