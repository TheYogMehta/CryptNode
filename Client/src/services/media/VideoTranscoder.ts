import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export class VideoTranscoder {
  private static instance: VideoTranscoder;
  private ffmpeg: FFmpeg | null = null;
  private isLoaded = false;

  private constructor() {}

  public static getInstance(): VideoTranscoder {
    if (!VideoTranscoder.instance) {
      VideoTranscoder.instance = new VideoTranscoder();
    }
    return VideoTranscoder.instance;
  }

  public async load(onLog?: (message: string) => void): Promise<void> {
    if (this.isLoaded) return;

    this.ffmpeg = new FFmpeg();
    
    if (onLog) {
      this.ffmpeg.on("log", ({ message }) => onLog(message));
    }

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    
    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    this.isLoaded = true;
  }

  public async transcodeToH264(
    inputBlob: Blob,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    if (!this.ffmpeg || !this.isLoaded) {
      await this.load();
    }

    const ffmpeg = this.ffmpeg!;
    const inputFileName = "input.mp4";
    const outputFileName = "output.mp4";

    if (onProgress) {
      ffmpeg.on("progress", ({ progress }) => onProgress(progress));
    }

    const inputData = await fetchFile(inputBlob);
    await ffmpeg.writeFile(inputFileName, inputData);

    // Transcode command: simple H.264 + AAC conversion
    // -preset ultrafast for speed on mobile/electron
    // -vcodec libx264 -acodec aac
    await ffmpeg.exec([
      "-i", inputFileName,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "28", // Lower quality but faster and smaller
      "-c:a", "aac",
      "-b:a", "128k",
      outputFileName
    ]);

    const data = await ffmpeg.readFile(outputFileName);
    const outputBlob = new Blob([data as any], { type: "video/mp4" });

    // Cleanup
    await ffmpeg.deleteFile(inputFileName);
    await ffmpeg.deleteFile(outputFileName);

    return outputBlob;
  }

  public isTranscodingSupported(): boolean {
    // Basic check for WASM and Secure Context (required for SharedArrayBuffer/Multithreading)
    // Even without SAB, single-threaded might work but we'll check browser support.
    return typeof WebAssembly !== "undefined";
  }
}

export const videoTranscoder = VideoTranscoder.getInstance();
