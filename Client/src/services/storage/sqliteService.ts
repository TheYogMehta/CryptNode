import { CapacitorSQLite } from "@capacitor-community/sqlite";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import {
  getKeyFromSecureStorage,
  setKeyFromSecureStorage,
} from "./SafeStorage";

let dbReady: Promise<void> | null = null;
let currentDbName = "cryptnode";
let currentKey: string | null = null;
let lastSecretSet: string | null = null;

const SCHEMA = {
  me: {
    columns: `
      id INTEGER PRIMARY KEY CHECK (id = 1),
      public_name TEXT,
      public_avatar TEXT,
      name_version INTEGER DEFAULT 1,
      avatar_version INTEGER DEFAULT 1
    `,
    indices: [],
  },
  sessions: {
    columns: `
      sid TEXT PRIMARY KEY UNIQUE, 
      keyJWK TEXT,
      alias_name TEXT,
      alias_avatar TEXT,
      peer_name TEXT,
      peer_avatar TEXT,
      peer_email TEXT,
      peer_hash TEXT,
      peer_name_ver INTEGER DEFAULT 0,
      peer_avatar_ver INTEGER DEFAULT 0,
      peer_pub_keys TEXT,
      last_sync_timestamp INTEGER DEFAULT 0,
      alias_timestamp INTEGER DEFAULT 0,
      last_manifest_sync INTEGER DEFAULT 0,
      notes TEXT,
      deleted_at INTEGER DEFAULT 0
    `,
    indices: [],
  },
  messages: {
    columns: `
      id TEXT PRIMARY KEY,
      sid TEXT, 
      sender TEXT, 
      text TEXT,
      type TEXT DEFAULT 'text',
      timestamp INTEGER,
      status INTEGER DEFAULT 1,
      is_read INTEGER DEFAULT 0,
      _ver INTEGER DEFAULT 2,
      reply_to TEXT,
      FOREIGN KEY(sid) REFERENCES sessions(sid) ON DELETE CASCADE
    `,
    indices: [
      "CREATE INDEX IF NOT EXISTS idx_msg_sid ON messages(sid);",
      "CREATE INDEX IF NOT EXISTS idx_msg_sid_timestamp ON messages(sid, timestamp DESC);",
      "CREATE INDEX IF NOT EXISTS idx_msg_sid_read ON messages(sid, is_read);",
    ],
  },
  media: {
    columns: `
      filename TEXT PRIMARY KEY,
      original_name TEXT,
      file_size INTEGER,
      mime_type TEXT,
      message_id TEXT,
      download_progress REAL DEFAULT 0,
      size INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      thumbnail TEXT,
      is_compressed INTEGER DEFAULT 0,
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
    `,
    indices: ["CREATE INDEX IF NOT EXISTS idx_media_msg ON media(message_id);"],
  },
  live_shares: {
    columns: `
      sid TEXT,
      port INTEGER,
      direction TEXT,
      message_id INTEGER,
      PRIMARY KEY (sid, port, direction),
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
    `,
    indices: [
      "CREATE INDEX IF NOT EXISTS idx_shares_msg ON live_shares(message_id);",
    ],
  },
  reactions: {
    columns: `
      id TEXT PRIMARY KEY,
      message_id TEXT,
      sender_email TEXT,
      emoji TEXT,
      timestamp INTEGER,
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
    `,
    indices: [
      "CREATE INDEX IF NOT EXISTS idx_reactions_msg ON reactions(message_id);",
    ],
  },
  queue: {
    columns: `
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      payload TEXT,
      priority INTEGER,
      timestamp INTEGER
    `,
    indices: [
      "CREATE INDEX IF NOT EXISTS idx_queue_priority ON queue(priority, timestamp);",
    ],
  },
  blocked_users: {
    columns: `
      email TEXT PRIMARY KEY,
      action TEXT DEFAULT 'block',
      timestamp INTEGER
    `,
    indices: [],
  },
  pending_requests: {
    columns: `
      email TEXT PRIMARY KEY,
      name TEXT,
      avatar TEXT,
      publicKey TEXT,
      senderHash TEXT,
      action TEXT DEFAULT 'pending',
      timestamp INTEGER
    `,
    indices: [],
  },
};

export const tableOrder = [
  "me",
  "sessions",
  "messages",
  "media",
  "live_shares",
  "reactions",
  "queue",
  "blocked_users",
  "pending_requests",
];

export const getCurrentDbName = () => currentDbName;

export const switchDatabase = async (dbName: string, key?: string) => {
  if (currentDbName === dbName && dbReady && currentKey === (key || null))
    return;

  console.log(`[sqlite] Switching database to: ${dbName}`);

  dbReady = null;
  currentDbName = dbName;
  currentKey = key || null;
  await dbInit();
};

export const dbInit = () => {
  if (dbReady) return dbReady;
  dbReady = (async () => {
    let key = currentKey;
    if (key && lastSecretSet !== key) {
      try {
        await CapacitorSQLite.setEncryptionSecret({ passphrase: key });
        lastSecretSet = key;
      } catch (e: any) {
        const msg = e.message || JSON.stringify(e);
        if (
          msg.includes("passphrase already in store") ||
          msg.includes("setEncryptionSecret")
        ) {
          console.log(
            "[sqlite] Passphrase likely already in store, continuing...",
          );
          lastSecretSet = key;
        } else {
          console.warn("Failed to set encryption key/secret:", e);
        }
      }
    }

    if (!key) {
      console.warn(
        "[sqlite] No encryption key provided. Checking for auto-generated default key...",
      );
      try {
        const defaultKeyName = "DEFAULT_DB_KEY";
        let storedDefault = await getKeyFromSecureStorage(defaultKeyName);
        if (!storedDefault) {
          console.warn(
            "[sqlite] No default key found. Generating new secure default key...",
          );
          const array = new Uint8Array(32);
          crypto.getRandomValues(array);
          const newKey = Array.from(array)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          await setKeyFromSecureStorage(defaultKeyName, newKey);
          storedDefault = newKey;
        }
        key = storedDefault;
        currentKey = key;
      } catch (err) {
        console.error(
          "[sqlite] Failed to auto-generate/retrieve default key:",
          err,
        );
      }
    }

    if (!key) {
      throw new Error(
        "Database encryption key is required. Unencrypted mode is disabled.",
      );
    }

    try {
      // Check for 0-byte file corruption which causes "file is not a database" error
      const filename = `${currentDbName}SQLite.db`;
      const directoriesToCheck = [Directory.Library, Directory.Documents, Directory.Data];

      for (const dir of directoriesToCheck) {
        try {
          const stats = await Filesystem.stat({ path: filename, directory: dir });
          if (stats.size === 0) {
            console.warn(`[sqlite] Detected 0-byte database file at ${dir}/${filename}. Purging corrupt file...`);
            await Filesystem.deleteFile({ path: filename, directory: dir });
            try {
              await CapacitorSQLite.closeConnection({ database: currentDbName, readonly: false });
            } catch (ignore) { }
          }
        } catch (e) {
          // File likely doesn't exist in this directory, continue
        }
      }

      // Always try to create connection before opening
      try {
        await CapacitorSQLite.createConnection({
          database: currentDbName,
          encrypted: true,
          mode: "secret",
          version: 1,
        });
      } catch (e) {
        // Ignore if connection already exists
      }

      await CapacitorSQLite.open({ database: currentDbName });
    } catch (openErr: any) {
      console.error("[sqlite] Failed to open database:", openErr);
      throw openErr;
    }

    await CapacitorSQLite.execute({
      database: currentDbName,
      statements: "PRAGMA foreign_keys = ON;",
    });

    for (const tableName of tableOrder) {
      const tableDef = SCHEMA[tableName as keyof typeof SCHEMA];
      await syncTableSchema(tableName, tableDef.columns);

      if (tableDef.indices.length > 0) {
        await CapacitorSQLite.execute({
          database: currentDbName,
          statements: tableDef.indices.join(";"),
        });
      }
    }
  })();
  return dbReady;
};

async function syncTableSchema(tableName: string, targetColumnsRaw: string) {
  const info = await CapacitorSQLite.query({
    database: currentDbName,
    statement: `PRAGMA table_info(${tableName});`,
    values: [],
  });

  const currentColumns = info?.values || [];
  const targetColumnsStr = targetColumnsRaw.replace(/\s+/g, " ").trim();

  if (currentColumns.length === 0) {
    await CapacitorSQLite.execute({
      database: currentDbName,
      statements: `CREATE TABLE ${tableName}(${targetColumnsStr});`,
    });
    return;
  }

  const existingNames = currentColumns.map((c: any) => c.name);
  const targetDefinitions =
    targetColumnsStr.match(/([^,()]+(\([^()]*\))?)+/g)?.map((s) => s.trim()) ||
    [];

  const targetNames = targetDefinitions
    .filter(
      (d) =>
        !d.toUpperCase().startsWith("FOREIGN KEY") &&
        !d.toUpperCase().startsWith("CONSTRAINT") &&
        !d.toUpperCase().startsWith("PRIMARY KEY"),
    )
    .map((d) => d.split(" ")[0]);

  const addedColumns = targetNames.filter(
    (name) => !existingNames.includes(name),
  );
  const removedColumns = existingNames.filter(
    (name) => !targetNames.includes(name),
  );

  if (addedColumns.length > 0 && removedColumns.length === 0) {
    for (const colName of addedColumns) {
      const definition = targetDefinitions.find((d) => d.startsWith(colName));
      await CapacitorSQLite.execute({
        database: currentDbName,
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

      `CREATE TABLE ${tableName}_new(${targetColumnsStr});`,
      ...(sharedColumns.length > 0
        ? [
          `INSERT INTO ${tableName}_new (${sharedColumns}) SELECT ${sharedColumns} FROM ${tableName};`,
        ]
        : []),
      `DROP TABLE ${tableName};`,
      `ALTER TABLE ${tableName}_new RENAME TO ${tableName};`,

      `PRAGMA foreign_keys=ON;`,
    ];

    await CapacitorSQLite.execute({
      database: currentDbName,
      statements: statements.join("\n"),
    });
  }
}

export const getMessagesSince = async (
  timestamp: number,
  sid?: string,
): Promise<any[]> => {
  if (sid) {
    return await queryDB(
      "SELECT * FROM messages WHERE sid = ? AND timestamp > ? ORDER BY timestamp ASC",
      [sid, timestamp],
    );
  }
  // Exclude messages from sessions that have been deleted (deleted_at > 0)
  return await queryDB(
    "SELECT m.* FROM messages m LEFT JOIN sessions s ON m.sid = s.sid WHERE m.timestamp > ? AND (s.deleted_at IS NULL OR s.deleted_at = 0) ORDER BY m.timestamp ASC",
    [timestamp],
  );
};

export const getMediaSince = async (timestamp: number): Promise<any[]> => {
  const rows = await queryDB(
    "SELECT * FROM media m JOIN messages msg ON m.message_id = msg.id WHERE msg.timestamp > ?",
    [timestamp],
  );
  return rows;
};

export const updateMessageMetadata = async (
  sid: string,
  limit: number = 50,
  offset: number = 0,
): Promise<any[]> => {
  const res = await queryDB(
    "SELECT * FROM messages WHERE sid = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
    [sid, limit, offset],
  );
  return res ? res.reverse() : [];
};

export const getMessages = async (
  sid: string,
  limit: number = 50,
  offset: number = 0,
): Promise<any[]> => {
  const res = await queryDB(
    "SELECT * FROM messages WHERE sid = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
    [sid, limit, offset],
  );
  return res ? res.reverse() : [];
};

export const queryDB = async (sql: string, values: any[] = []) => {
  await dbInit();
  const res = await CapacitorSQLite.query({
    database: currentDbName,
    statement: sql,
    values: values,
  });
  return res?.values ?? [];
};

export const executeDB = async (sql: string, values: any[] = []) => {
  await dbInit();
  await CapacitorSQLite.run({
    database: currentDbName,
    statement: sql,
    values: values,
  });
};

/**
 * Executes a set of SQL statements in a single transaction.
 * Optimized for bulk operations like MANIFEST sync.
 */
export const executeTransaction = async (
  statements: { statement: string; values?: any[] }[]
) => {
  if (statements.length === 0) return;
  await dbInit();
  await CapacitorSQLite.executeSet({
    database: currentDbName,
    set: statements,
  });
};

export const getMediaFilenames = async (): Promise<string[]> => {
  const rows = await queryDB("SELECT filename FROM media", []);
  return rows
    .map((row: { filename?: string }) => row.filename)
    .filter((name): name is string => !!name);
};

export const deleteDatabase = async (databaseName: string = currentDbName) => {
  try {
    const isElectron = Capacitor.getPlatform() === "electron";

    if (isElectron) {
      try {
        await CapacitorSQLite.closeConnection({
          database: databaseName,
          readonly: false,
        });
      } catch (ignore) {
        // ignore
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      if ((window as any).electron?.deleteDatabaseFiles) {
        const result = await (window as any).electron.deleteDatabaseFiles(
          databaseName,
        );
        if (result?.success) {
          if (databaseName === currentDbName) {
            dbReady = null;
          }
          console.log(`[sqlite] Deleted database files via electron IPC.`);
        } else {
          console.error(
            `[sqlite] Failed to delete database ${databaseName} via electron IPC`,
            result?.error,
          );
        }
        return;
      }
    } else {
      try {
        await CapacitorSQLite.deleteDatabase({ database: databaseName });
        if (databaseName === currentDbName) dbReady = null;
        console.log(`[sqlite] Deleted database ${databaseName} via CapacitorSQLite plugin.`);
      } catch (err) {
        console.error(`[sqlite] Failed to delete database ${databaseName} via CapacitorSQLite plugin`, err);
      }
    }
  } catch (e) {
    console.error(`[sqlite] Failed to process delete database ${databaseName}`, e);
  }
};

export const getMyProfileAndVersions = async (): Promise<{
  name: string;
  avatar: string;
  nameVersion: number;
  avatarVersion: number;
} | null> => {
  const rows = await queryDB(
    "SELECT public_name, public_avatar, name_version, avatar_version FROM me WHERE id = 1 LIMIT 1",
  );
  if (rows.length === 0) return null;
  return {
    name: rows[0].public_name || "",
    avatar: rows[0].public_avatar || "",
    nameVersion: rows[0].name_version || 1,
    avatarVersion: rows[0].avatar_version || 1,
  };
};

export const getAllAliasesEntries = async (): Promise<{
  sid: string;
  aliasName: string;
  aliasAvatar: string;
  timestamp: number;
  peerName: string;
  peerAvatar: string;
  peerNameVer: number;
  peerAvatarVer: number;
  peerEmail: string;
  peerHash: string;
  deletedAt: number;
}[]> => {
  const rows = await queryDB(
    "SELECT sid, alias_name, alias_avatar, alias_timestamp, peer_name, peer_avatar, peer_name_ver, peer_avatar_ver, peer_email, peer_hash, deleted_at FROM sessions",
  );
  return rows.map((r: any) => ({
    sid: r.sid,
    aliasName: r.alias_name || "",
    aliasAvatar: r.alias_avatar || "",
    timestamp: r.alias_timestamp || 0,
    peerName: r.peer_name || "",
    peerAvatar: r.peer_avatar || "",
    peerNameVer: r.peer_name_ver || 0,
    peerAvatarVer: r.peer_avatar_ver || 0,
    peerEmail: r.peer_email || "",
    peerHash: r.peer_hash || "",
    deletedAt: r.deleted_at || 0,
  }));
};

/** Mark a session as deleted (tombstone). Messages are deleted separately. */
export const markSessionDeleted = async (sid: string, timestamp: number = Date.now()) => {
  await executeDB(
    "UPDATE sessions SET deleted_at = ? WHERE sid = ?",
    [timestamp, sid],
  );
};

/** Returns all session IDs that have been locally deleted. */
export const getDeletedSessionIds = async (): Promise<string[]> => {
  const rows = await queryDB(
    "SELECT sid FROM sessions WHERE deleted_at > 0",
  );
  return rows.map((r: any) => r.sid);
};

export const updateLastManifestSync = async (
  sid: string,
  timestamp: number = Date.now(),
) => {
  await executeDB("UPDATE sessions SET last_manifest_sync = ? WHERE sid = ?", [
    timestamp,
    sid,
  ]);
};

export const getLastManifestSync = async (sid: string): Promise<number> => {
  const rows = await queryDB(
    "SELECT last_manifest_sync FROM sessions WHERE sid = ? LIMIT 1",
    [sid],
  );
  return rows[0]?.last_manifest_sync ?? 0;
};

export const setSessionAlias = async (
  sid: string,
  aliasName: string,
  aliasAvatar: string,
  timestamp: number = Date.now(),
) => {
  await executeDB(
    "UPDATE sessions SET alias_name = ?, alias_avatar = ?, alias_timestamp = ? WHERE sid = ?",
    [aliasName, aliasAvatar, timestamp, sid],
  );
};

/** Returns all active (currently blocked) users for UI display. */
export const getBlockedUsers = async (): Promise<
  { email: string; timestamp: number }[]
> => {
  const rows = await queryDB(
    "SELECT email, timestamp FROM blocked_users WHERE action = 'block' ORDER BY timestamp DESC",
  );
  return rows.map((r: any) => ({ email: r.email, timestamp: r.timestamp }));
};

/**
 * Returns ALL block/unblock entries (both actions) for the cross-device manifest.
 * The receiving device merges by keeping the higher-timestamp action per email.
 */
export const getAllBlockEntries = async (): Promise<
  { email: string; action: "block" | "unblock"; timestamp: number }[]
> => {
  const rows = await queryDB(
    "SELECT email, action, timestamp FROM blocked_users ORDER BY timestamp DESC",
  );
  return rows.map((r: any) => ({
    email: r.email,
    action: r.action as "block" | "unblock",
    timestamp: r.timestamp,
  }));
};

export const addBlockedUser = async (email: string) => {
  await executeDB(
    "INSERT OR REPLACE INTO blocked_users (email, action, timestamp) VALUES (?, 'block', ?)",
    [email, Date.now()],
  );
};

/** Marks the user as unblocked (keeps the row so the timestamp can be used in manifest merge). */
export const removeBlockedUser = async (email: string) => {
  await executeDB(
    "INSERT OR REPLACE INTO blocked_users (email, action, timestamp) VALUES (?, 'unblock', ?)",
    [email, Date.now()],
  );
};

export const isUserBlocked = async (email: string): Promise<boolean> => {
  const rows = await queryDB(
    "SELECT action FROM blocked_users WHERE email = ? LIMIT 1",
    [email],
  );
  return rows.length > 0 && rows[0].action === "block";
};

export const addPendingRequest = async (
  email: string,
  name: string,
  avatar: string,
  publicKey: string,
  senderHash: string,
) => {
  await executeDB(
    "INSERT OR REPLACE INTO pending_requests (email, name, avatar, publicKey, senderHash, action, timestamp) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
    [email, name, avatar, publicKey, senderHash, Date.now()],
  );
};

export const getPendingRequests = async (): Promise<any[]> => {
  const rows = await queryDB(
    "SELECT * FROM pending_requests WHERE action = 'pending' ORDER BY timestamp DESC",
  );
  return rows.map((r: any) => ({
    email: r.email,
    name: r.name,
    avatar: r.avatar,
    publicKey: r.publicKey,
    senderHash: r.senderHash,
    action: r.action,
    timestamp: r.timestamp,
  }));
};

/** Returns all request entries including accepted/denied tombstones for manifest sync */
export const getAllPendingRequestsEntries = async (): Promise<any[]> => {
  const rows = await queryDB(
    "SELECT email, name, avatar, publicKey, senderHash, action, timestamp FROM pending_requests ORDER BY timestamp DESC",
  );
  return rows.map((r: any) => ({
    email: r.email,
    name: r.name,
    avatar: r.avatar,
    publicKey: r.publicKey,
    senderHash: r.senderHash,
    action: r.action,
    timestamp: r.timestamp,
  }));
};

export const removePendingRequest = async (email: string) => {
  // Tombstone the row as denied instead of deleting it, so the sync can propagate the denial
  await executeDB(
    "UPDATE pending_requests SET action = 'denied', timestamp = ? WHERE email = ?",
    [Date.now(), email],
  );
};

export const acceptPendingRequest = async (email: string) => {
  await executeDB(
    "UPDATE pending_requests SET action = 'accepted', timestamp = ? WHERE email = ?",
    [Date.now(), email],
  );
};

export const updateSessionNotes = async (sid: string, notes: string) => {
  await executeDB("UPDATE sessions SET notes = ? WHERE sid = ?", [notes, sid]);
};

export const getMediaForSession = async (sid: string): Promise<any[]> => {
  const rows = await queryDB(
    "SELECT * FROM media m JOIN messages msg ON m.message_id = msg.id WHERE msg.sid = ? ORDER BY msg.timestamp DESC",
    [sid]
  );
  return rows;
};
