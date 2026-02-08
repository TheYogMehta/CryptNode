import { CompressionService } from "../services/CompressionService";
import {
  encryptToPackedString,
  decryptFromPackedString,
} from "../utils/crypto";

type WorkerMessage =
  | { type: "INIT_SESSION"; sid: string; keyJWK: JsonWebKey }
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

const sessions: Record<string, CryptoKey> = {};

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  const { type } = msg;

  try {
    switch (type) {
      case "INIT_SESSION": {
        const { sid, keyJWK } = msg;
        // Import key
        const key = await crypto.subtle.importKey(
          "jwk",
          keyJWK,
          { name: "AES-GCM" },
          false,
          ["encrypt", "decrypt"],
        );
        sessions[sid] = key;
        break;
      }

      case "ENCRYPT": {
        const { sid, data, id } = msg;
        const key = sessions[sid];
        if (!key) throw new Error(`Session ${sid} not found in worker`);

        const compressed = await CompressionService.compress(
          data instanceof ArrayBuffer ? data : data,
        );

        const encryptedBase64 = await encryptToPackedString(
          new Uint8Array(compressed),
          key,
        );

        self.postMessage({ type: "ENCRYPT_RESULT", id, data: encryptedBase64 });
        break;
      }

      case "DECRYPT": {
        const { sid, data, id } = msg;
        const key = sessions[sid];
        if (!key) throw new Error(`Session ${sid} not found in worker`);

        const decrypted = await decryptFromPackedString(data, key);
        if (!decrypted) throw new Error("Decryption failed");

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
    if (msg.type === "ENCRYPT" || msg.type === "DECRYPT") {
      self.postMessage({
        type: msg.type + "_RESULT",
        id: (msg as any).id,
        error: err.message,
      });
    }
  }
};
