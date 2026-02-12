import { StorageService, CHUNK_SIZE } from "../storage/StorageService";
import { queryDB, executeDB } from "../storage/sqliteService";

export interface IFileTransferClient {
  sessions: Record<string, any>;
  send(frame: any): void;
  encryptForSession(
    sid: string,
    data: string | Uint8Array | ArrayBuffer,
    priority: number,
  ): Promise<string>;
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

  public async sendFile(
    sid: string,
    fileData: File | Blob | string,
    fileInfo: { name: string; size: number; type: string },
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
    const isImage = fileInfo.type.startsWith("image/");
    const isVideo = fileInfo.type.startsWith("video/");
    const isAudio = fileInfo.type.startsWith("audio/");

    const msgType = isImage
      ? "image"
      : isVideo
      ? "video"
      : isAudio
      ? "audio"
      : "file";
    const messageId = await this.client.insertMessageRecord(
      sid,
      "",
      msgType,
      "me",
    );

    await StorageService.initMediaEntry(
      messageId,
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
          size: fileInfo.size,
          mimeType: fileInfo.type,
          messageId,
          thumbnail: thumb,
          compressed: (fileInfo as any).compressed || false,
        },
      }),
      1,
    );

    this.client.send({
      t: "MSG",
      sid,
      data: { payload: encryptedMetadata },
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
    if (!this.client.sessions[sid]?.online) {
      console.warn(
        `[FileTransfer] Cannot download ${messageId}, user ${sid} is OFFLINE`,
      );
      this.client.emit("notification", {
        type: "error",
        message: "User is offline. Download queued.",
      });
      return;
    }

    let startChunk = chunkIndex;
    try {
      const rows = await queryDB(
        "SELECT filename, size, status, file_size FROM media WHERE message_id = ?",
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
      `[FileTransfer] Sending download request for ${messageId} chunk ${startChunk} to ${sid}`,
    );
    const payload = await this.client.encryptForSession(
      sid,
      JSON.stringify({
        t: "MSG",
        data: { type: "FILE_REQ_CHUNK", messageId, chunkIndex: startChunk },
      }),
      1,
    );
    this.client.send({ t: "MSG", sid, data: { payload }, c: true, p: 1 });
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
      "SELECT filename, file_size FROM media WHERE message_id = ?",
      [messageId],
    );
    if (!rows.length) {
      console.error(
        `[FileTransfer] Media record not found for message ${messageId}`,
      );
      return;
    }

    const { filename, file_size } = rows[0];
    const totalChunks = Math.ceil(file_size / CHUNK_SIZE);

    for (
      let chunkIndex = startChunkIndex;
      chunkIndex < totalChunks;
      chunkIndex++
    ) {
      try {
        const base64Chunk = await StorageService.readChunk(
          filename,
          chunkIndex,
        );
        if (!base64Chunk) {
          console.error(
            `[FileTransfer] readChunk returned empty for ${filename} index ${chunkIndex}`,
          );
          return;
        }

        const isLast = chunkIndex === totalChunks - 1;
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
        this.client.send({ t: "MSG", sid, data: { payload }, c: false, p: 2 });

        if (!isLast) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }

        console.log(
          `[FileTransfer] Streamed chunk ${
            chunkIndex + 1
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
        "UPDATE media SET download_progress = ?, size = ? WHERE message_id = ?",
        [progress, currentSize, messageId],
      );
      console.log(
        `[FileTransfer] Received chunk ${chunkIndex} for ${messageId}, progress: ${progress}`,
      );

      if (isLast) {
        await executeDB(
          "UPDATE media SET status = 'downloaded' WHERE message_id = ?",
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
            const binaryString = atob(compressedData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: mediaRow[0].mime_type });
            const { CompressionService } = await import("./CompressionService");
            const decompressed = await CompressionService.decompressBlob(blob);
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
              this.client.emit("file_downloaded", { messageId });
            };
          } catch (e) {
            console.error("Decompression failed", e);
            this.client.emit("file_downloaded", { messageId });
          }
        } else {
          this.client.emit("file_downloaded", { messageId });
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

  public async handleFileInfo(sid: string, data: any) {
    const isImage = data.mimeType.startsWith("image/");
    const isVideo = data.mimeType.startsWith("video/");
    const isAudio = data.mimeType.startsWith("audio/");
    const msgType = isImage
      ? "image"
      : isVideo
      ? "video"
      : isAudio
      ? "audio"
      : "file";

    const localId = await this.client.insertMessageRecord(
      sid,
      data.name,
      msgType,
      "other",
      data.messageId,
    );
    console.log(
      `[FileTransfer] Received FILE_INFO: name=${data.name}, mime=${data.mimeType}, size=${data.size}`,
    );
    await StorageService.initMediaEntry(
      localId,
      data.name,
      data.size,
      data.mimeType,
      data.thumbnail,
      null,
      data.compressed,
    );
    this.client.emit("message", {
      sid,
      text: data.name,
      sender: "other",
      type: msgType,
      thumbnail: data.thumbnail,
      id: localId,
      mediaStatus: "pending",
    });
  }
}
