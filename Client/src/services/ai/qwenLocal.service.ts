import type { ChatMessage } from "../../pages/Home/types";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";

declare global {
  interface Window {
    Capacitor?: any;
  }
}

const MODEL_ID = "Qwen/Qwen3.5-0.8B";
const GGUF_URL =
  "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf";
const GGUF_FILENAME = "Qwen3.5-0.8B-Q4_K_M.gguf";

interface QwenGenerationOptions {
  maxNewTokens?: number;
  temperature?: number;
  topP?: number;
}

function clipContext(messages: ChatMessage[], draft: string): string {
  const history = messages
    .slice(-10)
    .map(
      (m) => `${m.sender === "me" ? "Me" : "Peer"}: ${(m.text || "").trim()}`,
    )
    .filter((line) => line.length > 0)
    .join("\n");
  return [history, draft ? `Draft: ${draft}` : ""].filter(Boolean).join("\n");
}

function extractText(output: any): string {
  if (!output) return "";
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const first = output[0];
    if (typeof first === "string") return first;
    if (first?.generated_text) return String(first.generated_text);
    if (first?.text) return String(first.text);
  }
  if (output.generated_text) return String(output.generated_text);
  if (output.text) return String(output.text);
  return "";
}

function parseBulletList(text: string, limit: number): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .filter(
      (line) => !line.match(/^(Sure|Here|Okay|I can|Possible|Suggestions)/i),
    );

  return Array.from(new Set(lines)).slice(0, limit);
}

// Worker instance for Web
let worker: Worker | null = null;
const pendingRequests: Record<
  string,
  {
    resolve: (data: any) => void;
    reject: (err: any) => void;
    onToken?: (token: string) => void;
  }
> = {};

function getWorker(): Worker {
  if (!worker) {
    console.log("[QwenLocalService] Initializing worker...");
    worker = new Worker(
      new URL("../../workers/qwen.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "init_result") {
        console.log("[QwenLocalService] Worker initialized");
      } else if (msg.type === "generate_result") {
        const req = pendingRequests[msg.id];
        if (req) {
          req.resolve(msg.output);
          delete pendingRequests[msg.id];
        }
      } else if (msg.type === "token") {
        const req = pendingRequests[msg.id];
        if (req && req.onToken) {
          req.onToken(msg.token);
        }
      } else if (msg.type === "error") {
        const req = pendingRequests[msg.id];
        if (req) {
          req.reject(new Error(msg.error));
          delete pendingRequests[msg.id];
        }
      }
    };

    worker.postMessage({ type: "init" });
  }
  return worker;
}

export class QwenLocalService {
  private _isLoaded = false;
  private _isLoading = false;
  public failed = false;
  private _downloadProgress = 0;
  private _installedCache: boolean | null = null;
  private _installedSize = 0;
  private _requiredSize = 532517120; // Exact bytes for Qwen3.5-0.8B-Q4_K_M.gguf
  private _downloadedBytes = 0;

  constructor() {}

  get isLoaded() {
    return this._isLoaded;
  }
  get isLoading() {
    return this._isLoading;
  }
  get downloadProgress() {
    return this._downloadProgress;
  }
  get installedSize() {
    return this._installedSize;
  }
  get requiredSize() {
    return this._requiredSize;
  }
  get downloadedBytes() {
    return this._downloadedBytes;
  }

  private listeners: (() => void)[] = [];

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  async isModelInstalled(): Promise<boolean> {
    if (this._installedCache !== null) return this._installedCache;
    try {
      const stat = await Filesystem.stat({
        directory: Directory.Data,
        path: GGUF_FILENAME,
      });
      this._installedCache = stat.size > 0;
      this._installedSize = stat.size || 0;
      return this._installedCache;
    } catch {
      this._installedCache = false;
      this._installedSize = 0;
      return false;
    }
  }

  async deleteModel(): Promise<void> {
    try {
      await Filesystem.deleteFile({
        directory: Directory.Data,
        path: GGUF_FILENAME,
      });
      this._isLoaded = false;
      this.failed = false;
      this._installedCache = null;
      this._installedSize = 0;
      this._downloadedBytes = 0;
      this.notify();
    } catch (e) {
      console.warn("Model already deleted or could not delete", e);
    }
  }

  async downloadModel(): Promise<void> {
    if (this._isLoading) return;
    this._isLoading = true;
    this.failed = false;
    this.notify();

    try {
      await this.ensureNativeModel();
      this._installedCache = true;
    } catch (e) {
      console.error("Failed to download model", e);
      this.failed = true;
      throw e; // Rethrow to let UI catch it
    } finally {
      this._isLoading = false;
      this._downloadProgress = 0;
      this.notify();
    }
  }

  private async ensureNativeModel(): Promise<string> {
    const dir = Directory.Data;
    const path = GGUF_FILENAME;

    try {
      const stat = await Filesystem.stat({ directory: dir, path });
      if (stat.size > 0) {
        const uri = await Filesystem.getUri({ directory: dir, path });
        return uri.uri.replace("file://", "");
      }
    } catch (e) {
      // File doesn't exist, proceed to download
    }

    console.log("[QwenLocalService] Downloading GGUF model...");
    this._downloadProgress = 1;
    this.notify();

    return new Promise<string>(async (resolve, reject) => {
      let listener: any = null;
      let isDone = false;

      const finishAndResolve = async () => {
        if (isDone) return;
        isDone = true;
        if (listener) listener.remove();

        this._downloadProgress = 100;
        this._installedCache = true;
        this._installedSize = this._requiredSize;
        this.notify();

        try {
          const uri = await Filesystem.getUri({ directory: dir, path });
          resolve(uri.uri.replace("file://", ""));
        } catch (e) {
          reject(e);
        }
      };

      try {
        listener = await Filesystem.addListener("progress", (status: any) => {
          if (status.url && status.url !== GGUF_URL) return;
          if (status.contentLength && status.contentLength > 0) {
            this._requiredSize = status.contentLength;
            this._downloadedBytes = status.bytes;
            const pct = Math.round((status.bytes / status.contentLength) * 100);
            if (pct !== this._downloadProgress && pct <= 100) {
              this._downloadProgress = pct;
              this.notify();
            } else {
              this.notify();
            }
            if (status.bytes >= status.contentLength) {
              finishAndResolve();
            }
          }
        });

        Filesystem.downloadFile({
          url: GGUF_URL,
          path: path,
          directory: dir,
          progress: true,
        }).then(
          (result) => {
            finishAndResolve();
          },
          (error) => {
            if (!isDone) {
              isDone = true;
              if (listener) listener.remove();
              console.error("[QwenLocalService] Failed to download model", error);
              reject(error);
            }
          }
        );
      } catch (error) {
        if (!isDone) {
          isDone = true;
          if (listener) listener.remove();
          console.error("[QwenLocalService] Failed to start model download", error);
          reject(error);
        }
      }
    });
  }

  async init(): Promise<void> {
    if (this._isLoaded) return;
    this._isLoading = true;
    this.notify();

    try {
      getWorker();
      await new Promise((resolve) => setTimeout(resolve, 100));
      this._isLoaded = true;
      this._installedCache = true; // model is on disk
    } catch (e: any) {
      console.error("[QwenLocalService] Failed to load model:", e);
      // Propagate the architecture unsupported error so 'generate' knows we failed
      if (e.message && e.message.includes("not supported")) {
        throw e;
      }
    } finally {
      this._isLoading = false;
      this._downloadProgress = 0;
      this.notify();
    }
  }

  private async generateWasm(
    prompt: string,
    options: QwenGenerationOptions & { onToken?: (token: string) => void },
  ): Promise<string> {
    const worker = getWorker();
    const id = Math.random().toString(36).substring(7);

    return await new Promise<string>((resolve, reject) => {
      pendingRequests[id] = {
        resolve: (output: any) => {
          resolve(extractText(output).trim());
        },
        reject,
        onToken: options.onToken,
      };

      worker.postMessage({
        type: "generate",
        id,
        prompt,
        options: {
          max_new_tokens: options.maxNewTokens ?? 128,
          temperature: options.temperature ?? 0.2,
          top_p: options.topP ?? 0.9,
          do_sample: true,
          return_full_text: false,
        },
      });
    });
  }

  async generate(
    messages: { role: string; content: string }[],
    options: QwenGenerationOptions & { onToken?: (token: string) => void } = {},
  ): Promise<string> {
    this._isLoading = true;
    this.notify();

    const prompt =
      messages
        .map((m) => `<|im_start|>${m.role}\n${m.content}<|im_end|>`)
        .join("\n") + "\n<|im_start|>assistant\n";

    try {
      if (!this._isLoaded) await this.init();
      if (!this._isLoaded)
        throw new Error("Local AI model failed to initialize.");

      return await this.generateWasm(prompt, { ...options, onToken: undefined });
    } finally {
      this._isLoading = false;
      this.notify();
    }
  }

  async quickReplies(
    messages: ChatMessage[],
    draft: string,
    limit: number,
  ): Promise<string[]> {
    const context = clipContext(messages, draft);
    const systemPrompt =
      "You are a communication assistant. Your goal is to keep the conversation flowing.";

    const userContent = [
      `Context:\n${context || "No prior context."}`,
      `\nTask: Generate ${limit} distinct short replies found in typical messaging apps.`,
      "Rules:",
      "1. Option 1: Positive/Agreement (e.g., 'Sounds good', 'Okay')",
      "2. Option 2: Negative/Polite Refusal (e.g., 'Maybe later', 'No thanks')",
      "3. Option 3: Question/Follow-up (e.g., 'What time?', 'Why?')",
      "4. Max 5 words per option.",
      "5. Output ONLY the replies, one per line.",
    ].join("\n");

    const raw = await this.generate(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      {
        maxNewTokens: 54, // Reduced tokens for speed
        temperature: 0.5, // Slightly higher for variety
      },
    );

    const parsed = parseBulletList(raw, limit);
    return parsed;
  }

  async summarize(messages: ChatMessage[], limit: number): Promise<string> {
    // Filter out noise (greetings, single words, very short messages)
    const meaningful = messages.filter(
      (m) => (m.text || "").trim().length >= 4,
    );

    if (meaningful.length === 0) {
      return "Not enough content to summarize.";
    }

    const context = meaningful
      .slice(-20)
      .map((m) => `${m.sender === "me" ? "Me" : "Peer"}: ${m.text!.trim()}`)
      .join("\n");

    // Few-shot example teaches the model the exact format.
    // Output is primed with "- " so the model jumps straight into bullets.
    const systemPrompt =
      "You extract key facts from chat logs. Output bullet points only. " +
      "Never add anything not explicitly stated in the chat.";

    const userContent =
      `Example:\n` +
      `Chat:\nMe: can we move the meeting to 3pm?\nPeer: sure, also bring the Q3 report\nMe: will do\n` +
      `Bullets:\n- Meeting moved to 3 PM\n- Peer requested Q3 report\n\n` +
      `Now do the same for this chat:\n` +
      `Chat:\n${context}\n` +
      `Bullets (max ${Math.max(3, limit)}, only facts from above):\n-`;

    const raw = await this.generate(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      { maxNewTokens: 180, temperature: 0.1 },
    );

    // Re-attach the leading "- " we used as a primer
    const trimmed = raw.trim();
    return trimmed.startsWith("-") ? trimmed : `- ${trimmed}`;
  }

  async summarizeSingleMessage(text: string): Promise<string> {
    if (!text || text.trim().length < 20) {
      return "Message is too short to summarize.";
    }

    const systemPrompt =
      "You rephrase a single message into a clear, concise summary. " +
      "Use plain English. Output one or two sentences only. Never add anything not in the message.";

    const userContent =
      `Example:\n` +
      `Message: "Hey sorry I missed your call earlier, I was in a meeting until like 3:30 and then had to run to pick up the kids. Can we catch up tomorrow morning maybe around 9 or 10?"\n` +
      `Summary: Missed the call due to a meeting and errands. Suggests catching up tomorrow around 9–10 AM.\n\n` +
      `Now summarize this message:\n` +
      `Message: "${text.trim()}"\n` +
      `Summary:`;

    const raw = await this.generate(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      { maxNewTokens: 80, temperature: 0.1 },
    );

    return raw.trim();
  }
  async smartCompose(draft: string): Promise<string> {
    if (!draft.trim()) return "";
    const systemPrompt =
      "You are a professional editor. Rewrite the input to be clear and polite, but keep it brief.";
    const userContent = `Rules:\n1. Fix grammar/typos.\n2. Make it sound confident.\n3. Do not add facts.\n4. Output ONLY the rewritten text.\n\nInput: "${draft}"\nRewritten:`;

    const raw = await this.generate(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      { maxNewTokens: 64, temperature: 0.3 },
    );
    let cleaned = raw.trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1);
    }
    cleaned = cleaned.replace(/^(Here is|Sure,|I have rewritten).+?:\s*/i, "");
    cleaned = cleaned.split(/Note:|Explanation:/i)[0].trim();
    return cleaned;
  }
}

export const qwenLocalService = new QwenLocalService();
