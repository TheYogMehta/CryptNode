import type { ChatMessage } from "../../pages/Home/types";
import { Filesystem, Directory } from "@capacitor/filesystem";
import {
  NativeLlamaContext,
  Llama as LlamaPlugin,
  TokenEvent,
} from "@cantoo/capacitor-llama";
import { Capacitor } from "@capacitor/core";

declare global {
  interface Window {
    Capacitor?: any;
  }
}

const MODEL_ID = "Xenova/Qwen1.5-0.5B-Chat";
const GGUF_URL =
  "https://huggingface.co/Qwen/Qwen1.5-0.5B-Chat-GGUF/resolve/main/qwen1_5-0_5b-chat-q4_k_m.gguf";
const GGUF_FILENAME = "qwen1_5-0_5b-chat-q4_k_m.gguf";

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
  private isNative = false;
  private nativeContextId = -1;
  private _downloadProgress = 0;

  constructor() {
    const platform =
      typeof window !== "undefined" ? Capacitor.getPlatform() : "web";
    if (platform === "android" || platform === "ios") {
      this.isNative = true;
    }
  }

  get isLoaded() {
    return this._isLoaded;
  }
  get isLoading() {
    return this._isLoading;
  }
  get downloadProgress() {
    return this._downloadProgress;
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
    try {
      const stat = await Filesystem.stat({
        directory: Directory.Data,
        path: GGUF_FILENAME,
      });
      return stat.size > 0;
    } catch {
      return false;
    }
  }

  async deleteModel(): Promise<void> {
    try {
      if (this.isNative && this.nativeContextId !== -1) {
        await LlamaPlugin.releaseAllContexts();
      }
      await Filesystem.deleteFile({
        directory: Directory.Data,
        path: GGUF_FILENAME,
      });
      this._isLoaded = false;
      this.failed = false;
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

    try {
      // Fetch from remote
      const req = await fetch(GGUF_URL);
      if (!req.ok) throw new Error("Failed to download model");

      const contentLength = req.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;

      const reader = req.body?.getReader();
      if (!reader) throw new Error("Could not get response stream");

      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.byteLength;
          if (total) {
            this._downloadProgress = Math.round((loaded / total) * 100);
            this.notify();
          }
        }
      }

      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const c of chunks) {
        combined.set(c, offset);
        offset += c.length;
      }

      const blob = new Blob([combined]);
      const base64Data = await new Promise<string>((resolve) => {
        const fr = new FileReader();
        fr.readAsDataURL(blob);
        fr.onloadend = () => {
          resolve(fr.result as string);
        };
      });

      console.log("[QwenLocalService] Saving to filesystem...");
      await Filesystem.writeFile({
        directory: dir,
        path: path,
        data: base64Data,
      });

      this._downloadProgress = 100;
      this.notify();

      const uri = await Filesystem.getUri({ directory: dir, path });
      return uri.uri.replace("file://", "");
    } catch (error) {
      console.error("[QwenLocalService] Failed to download model", error);
      throw error;
    }
  }

  async init(): Promise<void> {
    if (this._isLoaded) return;
    this._isLoading = true;
    this.notify();

    try {
      if (this.isNative) {
        try {
          const absolutePath = await this.ensureNativeModel();
          console.log(
            "[QwenLocalService] Initializing Native Llama context:",
            absolutePath,
          );

          await LlamaPlugin.releaseAllContexts();

          this.nativeContextId = Math.floor(Math.random() * 10000);
          const initPromise = LlamaPlugin.initContext({
            id: this.nativeContextId,
            model: absolutePath,
            n_ctx: 1024,
            n_threads: 4,
          });

          await Promise.race([
            initPromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("initContext timeout")), 2000),
            ),
          ]);
        } catch (nativeErr) {
          console.warn(
            "[QwenLocalService] Native Llama init failed or timed out. WASM fallback disabled on mobile.",
            nativeErr,
          );
          this.isNative = false;
          throw new Error(
            "Local AI is not supported on this device architecture.",
          );
        }
      }

      if (!this.isNative) {
        getWorker();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      this._isLoaded = true;
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

      if (this.isNative) {
        let tokenListener: any;
        if (options.onToken) {
          tokenListener = await LlamaPlugin.addListener(
            "onToken",
            (event: TokenEvent) => {
              if (event.contextId === this.nativeContextId) {
                options.onToken?.(event.tokenResult.token);
              }
            },
          );
        }

        const res = await LlamaPlugin.completion({
          id: this.nativeContextId,
          params: {
            prompt,
            n_predict: options.maxNewTokens ?? 128,
            temperature: options.temperature ?? 0.2,
            top_p: options.topP ?? 0.9,
            stop: ["<|im_end|>", "<|im_start|>"],
            emit_partial_completion: false,
          },
        });

        if (tokenListener) await tokenListener.remove();

        return res.content.trim();
      } else {
        return await this.generateWasm(prompt, options);
      }
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
    const context = clipContext(messages, "");
    const systemPrompt =
      "You are a concise note-taker. You start directly with the first bullet point.";

    const userContent = [
      `Conversation:\n${context || "No messages."}`,
      `\nTask: Extract key facts into exactly ${Math.max(
        3,
        limit,
      )} bullet points.`,
      "Rules:",
      "- Start every line with a hyphen (-).",
      "- No intro (e.g., 'Here is the summary').",
      "- No outro.",
      "- Focus on decisions, times, and dates.",
    ].join("\n");

    return this.generate(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      { maxNewTokens: 256, temperature: 0.2 },
    );
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
