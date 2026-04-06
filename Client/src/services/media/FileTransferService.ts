import { StorageService, CHUNK_SIZE } from "../storage/StorageService";
import { queryDB, executeDB } from "../storage/sqliteService";
import { MAX_ENCRYPTED_PAYLOAD_CHARS } from "../core/protocolLimits";
import { sha256 } from "../../utils/crypto";
import { getMessageTypeForUpload } from "../../utils/mediaType";

export interface IFileTransferClient {
  sessions: Record<string, any>;
  userEmail: string | null;
  send(frame: any): void;
  encryptForSession(
    sid: string,
    data: string | Uint8Array | ArrayBuffer,
    priority: number,
  ): Promise<Record<string, string>>;
  emit(event: string, ...args: any[]): boolean;
  insertMessageRecord(
    sid: string,
    text: string,
    type: string,
    sender: string,
    forceId?: string,
    replyTo?: any,
  ): Promise<string>;
}

export class FileTransferService {
  private client: IFileTransferClient;

  constructor(client: IFileTransferClient) {
    this.client = client;
  }

  private assertPayloadSize(
    payloads: Record<string, string> | string,
    context: string,
  ): boolean {
    const size =
      typeof payloads === "string"
        ? payloads.length
        : JSON.stringify(payloads).length;
    if (size <= MAX_ENCRYPTED_PAYLOAD_CHARS) return true;
    console.warn(
      `[FileTransfer] Blocked ${context}: encrypted payload too large (${size})`,
    );
    this.client.emit("notification", {
      type: "error",
      message: "Payload too large. Please retry with a smaller file.",
    });
    return false;
  }

  public async sendFile(
    sid: string,
    fileData: File | Blob | string,
    fileInfo: { name: string; size: number; type: string; caption?: string },
    messageId?: string
  ) {
    if (!this.client.sessions[sid]) throw new Error("Session not found");

    console.log(`[FileTransfer] sendFile: Processing...`);

    let blob: Blob;
    if (fileData instanceof Blob) {
      blob = fileData;
    } else if (typeof fileData === "string") {
      console.log(`[FileTransfer] Fetching URI: ${fileData}`);
      const response = await fetch(fileData);
      blob = await response.blob();
    } else {
      throw new Error("Invalid file data type");
    }

    console.log(`[FileTransfer] Blob size ${blob.size}, type ${blob.type}`);
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        const base64 = res.includes(",") ? res.split(",")[1] : res;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    console.log(`[FileTransfer] Base64 length: ${base64Data.length}`);
    const vaultFilename = await StorageService.saveRawFile(base64Data);
    console.log(`[FileTransfer] Saved to vault: ${vaultFilename}`);

    const thumbUri =
      typeof fileData === "string" ? fileData : URL.createObjectURL(fileData);

    const { generateThumbnail } = await import("../../utils/imageUtils");
    const thumb = await generateThumbnail(thumbUri, fileInfo.type);
    if (typeof fileData !== "string") {
      URL.revokeObjectURL(thumbUri);
    }
    const msgType = getMessageTypeForUpload({
      name: fileInfo.name,
      type: fileInfo.type,
    });
    const finalMessageId = await this.client.insertMessageRecord(
      sid,
      fileInfo.caption || "",
      msgType,
      "me",
      messageId
    );

    await StorageService.initMediaEntry(
      finalMessageId,
      fileInfo.name,
      fileInfo.size,
      fileInfo.type,
      thumb,
      vaultFilename,
      (fileInfo as any).compressed || false,
    );

    const encryptedMetadata = await this.client.encryptForSession(
      sid,
      JSON.stringify({
        t: "MSG",
        data: {
          type: "FILE_INFO",
          name: fileInfo.name,
          caption: fileInfo.caption || "",
          size: fileInfo.size,
          mimeType: fileInfo.type,
          messageId: finalMessageId,
          thumbnail: thumb,
          compressed: (fileInfo as any).compressed || false,
        },
      }),
      1,
    );
    if (!this.assertPayloadSize(encryptedMetadata, "FILE_INFO")) return;

    this.client.send({
      t: "MSG",
      sid,
      data: { payloads: encryptedMetadata },
      c: true,
      p: 1,
    });
    this.client.emit("session_updated");
  }

  public async requestDownload(
    sid: string,
    messageId: string,
    chunkIndex: number = 0,
  ) {
    const myEmail = this.client.userEmail;
    let ownSid: string | null = null;
    if (myEmail) {
      const normalizedEmail = myEmail.trim().toLowerCase();
      ownSid = await sha256(normalizedEmail + ":" + normalizedEmail);
    }

    const msgRows = await queryDB(
      "SELECT sender, sid FROM messages WHERE id = ?",
      [messageId],
    );
    const msgSender = msgRows[0]?.sender || "other";
    const msgSid = msgRows[0]?.sid || sid;

    let targetSid: string | null = null;

    if (msgSender === "me") {
      // Sent by one of our own devices. Prioritize asking our own devices.
      if (ownSid && this.client.sessions[ownSid]?.online) {
        targetSid = ownSid;
      } else if (msgSid && this.client.sessions[msgSid]?.online) {
        targetSid = msgSid;
      }
    } else {
      // Sent by the remote peer. Prioritize asking them as they definitely have it.
      if (msgSid && this.client.sessions[msgSid]?.online) {
        targetSid = msgSid;
      } else if (ownSid && this.client.sessions[ownSid]?.online) {
        targetSid = ownSid;
      }
    }

    if (!targetSid) {
      console.warn(
        `[FileTransfer] Cannot download ${messageId}, no online sources found. (ownSid=${ownSid}, msgSid=${msgSid}, sender=${msgSender})`,
      );
      this.client.emit("notification", {
        type: "error",
        message: "No online devices can serve this file.",
      });
      return;
    }

    let startChunk = chunkIndex;
    try {
      const rows = await queryDB(
        "SELECT filename, original_name, file_size, mime_type, thumbnail, status FROM media WHERE message_id = ?",
        [messageId],
      );
      if (rows.length > 0) {
        const { filename, status } = rows[0];

        if (
          filename &&
          (status === "downloading" ||
            status === "pending" ||
            status === "error" ||
            status === "stopped")
        ) {
          const diskSize = await StorageService.getFileSize(filename);
          if (diskSize > 0) {
            if (diskSize % CHUNK_SIZE !== 0) {
              console.warn(
                `[FileTransfer] Disk size ${diskSize} is not multiple of ${CHUNK_SIZE}, restarting download.`,
              );
              startChunk = 0;
              await StorageService.deleteFile(filename);
              await StorageService.initMediaEntry(
                messageId,
                rows[0].original_name,
                rows[0].file_size,
                rows[0].mime_type,
                rows[0].thumbnail,
              );
            } else {
              startChunk = Math.floor(diskSize / CHUNK_SIZE);
              console.log(
                `[FileTransfer] Resuming download for ${messageId} from chunk ${startChunk}`,
              );
            }
          }
        }
      }
    } catch (e) {
      console.error("[FileTransfer] Error checking resume status:", e);
    }

    console.log(
      `[FileTransfer] Sending download request for ${messageId} chunk ${startChunk} to target: ${targetSid}`,
    );

    const payload = await this.client.encryptForSession(
      targetSid,
      JSON.stringify({
        t: "MSG",
        data: { type: "FILE_REQ_CHUNK", messageId, chunkIndex: startChunk },
      }),
      1,
    );
    this.client.send({
      t: "MSG",
      sid: targetSid,
      data: { payloads: payload },
      c: true,
      p: 1,
    });
  }

  public async streamAllChunks(
    sid: string,
    messageId: string,
    startChunkIndex: number,
  ) {
    console.log(
      `[FileTransfer] Starting chunk stream for ${messageId} from index ${startChunkIndex}`,
    );

    const rows = await queryDB(
      "SELECT filename, file_size, original_name, mime_type, thumbnail, is_compressed FROM media WHERE message_id = ?",
      [messageId],
    );
    if (!rows.length) {
      console.error(
        `[FileTransfer] Media record not found for message ${messageId}`,
      );
      return;
    }

    const { filename, file_size, original_name, mime_type, thumbnail, is_compressed } = rows[0];

    if (startChunkIndex === 0) {
      // Send FILE_INFO first so a synced device missing the media record can initialize it dynamically
      try {
        const infoPayload = await this.client.encryptForSession(
          sid,
          JSON.stringify({
            t: "MSG",
            data: {
              type: "FILE_INFO",
              messageId,
              name: original_name,
              size: file_size,
              mimeType: mime_type,
              thumbnail,
              compressed: is_compressed === 1,
              caption: "", // Sync purely for initialization purpose
            },
          }),
          1,
        );
        this.client.send({
          t: "MSG",
          sid,
          data: { payloads: infoPayload },
          c: false,
          p: 1,
        });
        // Give the receiving end a moment to initialize the SQLite media entry before chunks arrive
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (e) {
        console.error("[FileTransfer] Failed to send dynamic FILE_INFO:", e);
      }
    }

    const base64Data = await StorageService.readFile(filename);
    if (!base64Data) {
      console.error(`[FileTransfer] Could not read file ${filename}`);
      return;
    }
    const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);

    for (
      let chunkIndex = startChunkIndex;
      chunkIndex < totalChunks;
      chunkIndex++
    ) {
      try {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, base64Data.length);
        const base64Chunk = base64Data.slice(start, end);

        const isLast = chunkIndex === totalChunks - 1;
        if (!base64Chunk && !isLast) {
          console.error(
            `[FileTransfer] Sliced chunk empty for ${filename} index ${chunkIndex}`,
          );
          return;
        }

        const payload = await this.client.encryptForSession(
          sid,
          JSON.stringify({
            t: "MSG",
            data: {
              type: "FILE_CHUNK",
              messageId,
              chunkIndex,
              payload: base64Chunk,
              isLast,
            },
          }),
          2,
        );
        if (!this.assertPayloadSize(payload, "FILE_CHUNK")) {
          return;
        }
        this.client.send({
          t: "MSG",
          sid,
          data: { payloads: payload },
          c: false,
          p: 2,
        });

        if (!isLast) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }

        console.log(
          `[FileTransfer] Streamed chunk ${chunkIndex + 1
          }/${totalChunks} for ${messageId}`,
        );
      } catch (e) {
        console.error(
          `[FileTransfer] Failed to stream chunk ${chunkIndex}:`,
          e,
        );
        return;
      }
    }

    console.log(
      `[FileTransfer] Finished streaming all ${totalChunks} chunks for ${messageId}`,
    );
  }

  public async handleFileChunk(sid: string, data: any) {
    const { messageId, payload, chunkIndex, isLast } = data;
    try {
      const rows = await queryDB(
        "SELECT filename, file_size FROM media WHERE message_id = ?",
        [messageId],
      );
      if (!rows.length) return;
      const { filename, file_size } = rows[0];
      await StorageService.appendChunk(filename, payload);

      const currentSize = Math.min((chunkIndex + 1) * CHUNK_SIZE, file_size);
      const progress = currentSize / file_size;

      await executeDB(
        "UPDATE media SET status = 'downloading', download_progress = ?, size = ? WHERE message_id = ?",
        [progress, currentSize, messageId],
      );
      console.log(
        `[FileTransfer] Received chunk ${chunkIndex} for ${messageId}, progress: ${progress}`,
      );

      if (isLast) {
        await executeDB(
          "UPDATE media SET status = 'downloaded', download_progress = 1.0, size = file_size WHERE message_id = ?",
          [messageId],
        );

        const mediaRow = await queryDB(
          "SELECT is_compressed, filename, mime_type FROM media WHERE message_id = ?",
          [messageId],
        );
        if (mediaRow.length && mediaRow[0].is_compressed) {
          try {
            console.log(
              `[FileTransfer] Decompressing ${mediaRow[0].filename}...`,
            );
            const compressedParams = {
              fileName: mediaRow[0].filename,
            };
            const compressedData = await StorageService.readFile(
              compressedParams.fileName,
            );
            const resFetch = await fetch(`data:application/octet-stream;base64,${compressedData}`);
            const arrayBuffer = await resFetch.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: mediaRow[0].mime_type });
            const { CompressionService } = await import("./CompressionService");
            const decompressed = await CompressionService.decompressBlob(blob);

            await new Promise((resolve) => {
              const reader = new FileReader();
              reader.readAsDataURL(decompressed);
              reader.onloadend = async () => {
                const res = reader.result as string;
                const base64 = res.includes(",") ? res.split(",")[1] : res;
                await StorageService.saveRawFile(base64, mediaRow[0].filename);
                await executeDB(
                  "UPDATE media SET is_compressed = 0 WHERE message_id = ?",
                  [messageId],
                );
                resolve(null);
              };
            });
            this.client.emit("file_downloaded", { messageId, filename });
          } catch (e) {
            console.error("[FileTransfer] Decompression failed:", e);
            await StorageService.finalizeMediaFile(filename);
            this.client.emit("file_downloaded", { messageId, filename });
          }
        } else {
          await StorageService.finalizeMediaFile(filename);
          this.client.emit("file_downloaded", { messageId, filename });
        }
      } else {
        this.client.emit("download_progress", { messageId, progress });
      }
    } catch (e) {
      console.error(
        `[FileTransfer] Error handling chunk ${chunkIndex} for ${messageId}:`,
        e,
      );
      await executeDB(
        "UPDATE media SET status = 'error' WHERE message_id = ?",
        [messageId],
      );
      this.client.emit("notification", {
        type: "error",
        message: "Download failed. Please try again.",
      });
    }
  }

  public async handleFileInfo(sid: string, data: any, sender: string = "other") {
    const msgType = getMessageTypeForUpload({
      name: data.name,
      type: data.mimeType,
    });

    const existingRows = await queryDB("SELECT 1 FROM messages WHERE id = ?", [data.messageId]);
    const isNewMessage = existingRows.length === 0;

    const localId = await this.client.insertMessageRecord(
      sid,
      data.caption || "",
      msgType,
      sender,
      data.messageId,
    );
    console.log(
      `[FileTransfer] Received FILE_INFO: name=${data.name}, caption=${data.caption}, mime=${data.mimeType}, size=${data.size}, sender=${sender}`,
    );

    // Safety check so we don't crash if the media row already exists somehow
    const existingMedia = await queryDB("SELECT 1 FROM media WHERE message_id = ?", [data.messageId]);
    if (existingMedia.length === 0) {
      await StorageService.initMediaEntry(
        localId,
        data.name,
        data.size,
        data.mimeType,
        data.thumbnail,
        null,
        data.compressed,
      );
    }

    if (isNewMessage) {
      this.client.emit("message", {
        sid,
        text: data.caption || "",
        sender: sender,
        type: msgType,
        thumbnail: data.thumbnail,
        id: localId,
        mediaStatus: "pending",
      });
    } else {
      this.client.emit("message_metadata_updated", {
        sid,
        messageId: localId,
        mediaOriginalName: data.name,
        mediaTotalSize: data.size,
        mediaMime: data.mimeType,
        thumbnail: data.thumbnail,
      });
    }
  }
}
