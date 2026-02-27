import { CompressionService } from "../services/media/CompressionService";
import {
  encryptToPackedString,
  decryptFromPackedString,
} from "../utils/crypto";

type WorkerMessage =
  | {
      type: "INIT_SESSION";
      sid: string;
      jwksMap: Record<string, JsonWebKey>;
      id: string;
    }
  | {
      type: "ENCRYPT";
      sid: string;
      data: string | ArrayBuffer;
      id: string;
      priority: number;
    }
  | {
      type: "DECRYPT";
      sid: string;
      data: string;
      id: string;
      priority: number;
    };

const sessions: Record<string, Record<string, CryptoKey>> = {};

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  const { type } = msg;

  try {
    switch (type) {
      case "INIT_SESSION": {
        const { sid, jwksMap, id } = msg;
        const keysMap: Record<string, CryptoKey> = {};
        for (const [pubKey, jwk] of Object.entries(jwksMap)) {
          if (!jwk || typeof jwk !== "object") continue;
          try {
            keysMap[pubKey] = await crypto.subtle.importKey(
              "jwk",
              jwk,
              { name: "AES-GCM" },
              false,
              ["encrypt", "decrypt"],
            );
          } catch (e) {
            console.warn(`[Worker] Skipping bad JWK import for ${pubKey}`, e);
          }
        }
        sessions[sid] = keysMap;
        self.postMessage({ type: "INIT_SESSION_RESULT", id, data: true });
        break;
      }

      case "ENCRYPT": {
        const { sid, data, id } = msg;
        const keysMap = sessions[sid];
        if (!keysMap || Object.keys(keysMap).length === 0)
          throw new Error(`Session ${sid} not found in worker`);

        const compressed = await CompressionService.compress(
          data instanceof ArrayBuffer ? data : data,
        );

        const payloads: Record<string, string> = {};
        const u8 = new Uint8Array(compressed);
        for (const [pubKey, key] of Object.entries(keysMap)) {
          payloads[pubKey] = await encryptToPackedString(u8, key);
        }

        self.postMessage({ type: "ENCRYPT_RESULT", id, data: payloads });
        break;
      }

      case "DECRYPT": {
        const { sid, data, id } = msg;
        const keysMap = sessions[sid];
        if (!keysMap || Object.keys(keysMap).length === 0)
          throw new Error(`Session ${sid} not found in worker`);

        let decrypted: Uint8Array | null = null;
        for (const key of Object.values(keysMap)) {
          try {
            decrypted = await decryptFromPackedString(data, key);
            if (decrypted) break;
          } catch (e) {}
        }

        if (!decrypted) throw new Error("Decryption failed for all known keys");

        const decompressed = await CompressionService.decompress(
          decrypted.buffer as ArrayBuffer,
          false,
        );

        self.postMessage({ type: "DECRYPT_RESULT", id, data: decompressed });
        break;
      }
    }
  } catch (err: any) {
    console.error("Worker Error:", err);
    if (
      msg.type === "ENCRYPT" ||
      msg.type === "DECRYPT" ||
      msg.type === "INIT_SESSION"
    ) {
      self.postMessage({
        type: msg.type + "_RESULT",
        id: (msg as any).id,
        error: err.message,
      });
    }
  }
};
