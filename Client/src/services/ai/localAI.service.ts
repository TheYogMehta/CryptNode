import { Filesystem, Directory } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import {
  Llama as LlamaPlugin,
  TokenEvent,
} from "@cantoo/capacitor-llama";
import { Capacitor } from "@capacitor/core";
import type { ChatMessage } from "../../pages/Home/types";
import { LocalAIModel, RECOMMENDED_MODELS } from "./models";

declare global {
  interface Window {
    Capacitor?: any;
  }
}

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
    console.log("[LocalAIService] Initializing worker...");
    worker = new Worker(
      new URL("../../workers/qwen.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "init_result") {
        console.log("[LocalAIService] Worker initialized");
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

export interface StoredModel extends LocalAIModel {
  isDownloaded: boolean;
  downloadedBytes: number;
}

export class LocalAIService {
  private _isLoaded = false;
  private _isLoading = false;
  public failed = false;
  private isNative = false;
  private nativeContextId = -1;
  private _downloadProgress = 0;
  private _installedCache = new Map<string, boolean>();
  private _installedSizes = new Map<string, number>();
  private _downloadInfo: { activeModelId: string, bytes: number, total: number } | null = null;
  private _cancelFlag = false;
  private _refreshingPromise: Promise<void> | null = null;

  private _models: LocalAIModel[] = [];
  private _activeModelId: string | null = null;

  constructor() {
    const platform =
      typeof window !== "undefined" ? Capacitor.getPlatform() : "web";
    if (platform === "android" || platform === "ios") {
      this.isNative = true;
    }
    this.loadStateFromPreferences();
  }

  get isLoaded() { return this._isLoaded; }
  get isLoading() { return this._isLoading; }
  get downloadProgress() { return this._downloadProgress; }
  get downloadInfo() { return this._downloadInfo; }
  get activeModelId() { return this._activeModelId; }
  get storedModels() { return this._models; }

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

  // Persist the state of what models exist in our "library"
  private async loadStateFromPreferences() {
    try {
      const { value: modelsJson } = await Preferences.get({ key: 'local_ai_models' });
      if (modelsJson) {
        this._models = JSON.parse(modelsJson);
      } else {
        // Fallback or migration for old users who downloaded Qwen
        this._models = [RECOMMENDED_MODELS[0]];
      }

      const { value: activeId } = await Preferences.get({ key: 'local_ai_active_id' });
      if (activeId && this._models.find(m => m.id === activeId)) {
        this._activeModelId = activeId;
      } else if (this._models.length > 0) {
        this._activeModelId = this._models[0].id; // Fallback
      }

      // Check which ones are downloaded
      await this.refreshInstalledStatus();
    } catch (e) {
      console.error("Failed to load AI preferences", e);
    }
  }

  private async saveStateToPreferences() {
    try {
      await Preferences.set({ key: 'local_ai_models', value: JSON.stringify(this._models) });
      if (this._activeModelId) {
        await Preferences.set({ key: 'local_ai_active_id', value: this._activeModelId });
      } else {
        await Preferences.remove({ key: 'local_ai_active_id' });
      }
    } catch (e) {
      console.error("Failed to save AI preferences", e);
    }
  }

  // Refreshes the `isDownloaded` / `installedSize` status for all models
  async refreshInstalledStatus(): Promise<void> {
    if (this._refreshingPromise) return this._refreshingPromise;

    this._refreshingPromise = (async () => {
      for (const model of this._models) {
        try {
          const stat = await Filesystem.stat({
            directory: Directory.Data,
            path: model.filename,
          });
          this._installedCache.set(model.id, stat.size > 0);
          this._installedSizes.set(model.id, stat.size || 0);
        } catch {
          this._installedCache.set(model.id, false);
          this._installedSizes.set(model.id, 0);
        }
      }
      this.notify();
    })();

    try {
      await this._refreshingPromise;
    } finally {
      this._refreshingPromise = null;
    }
  }

  async getEnhancedModels(): Promise<StoredModel[]> {
    await this.refreshInstalledStatus();
    return this._models.map(m => ({
      ...m,
      isDownloaded: this._installedCache.get(m.id) || false,
      downloadedBytes: this._installedSizes.get(m.id) || 0
    }));
  }

  async addModelToLibrary(model: LocalAIModel) {
    if (!this._models.find(m => m.id === model.id)) {
      this._models.push(model);
      await this.saveStateToPreferences();
      this.notify();
    }
  }

  async updateModelMetadata(modelId: string, name: string, description: string) {
    const model = this._models.find(m => m.id === modelId);
    if (!model) return;
    model.name = name;
    model.description = description;
    await this.saveStateToPreferences();
    this.notify();
  }

  async removeModelFromLibrary(modelId: string) {
    const isCustom = !RECOMMENDED_MODELS.find(m => m.id === modelId);
    if (!isCustom) return; // Only custom models can be fully removed from library

    // Delete the physical file if it exists
    await this.deleteModel(modelId);

    // Remove from array and persist
    this._models = this._models.filter(m => m.id !== modelId);
    if (this._activeModelId === modelId) {
      this._activeModelId = this._models.length > 0 ? this._models[0].id : null;
    }
    
    await this.saveStateToPreferences();
    this.notify();
  }

  async setActiveModel(modelId: string) {
    if (this._activeModelId === modelId) return;
    const model = this._models.find(m => m.id === modelId);
    if (!model) throw new Error("Model not found in library");

    this._activeModelId = modelId;
    await this.saveStateToPreferences();
    
    // Release current context
    if (this.isNative && this.nativeContextId !== -1) {
      try {
        await LlamaPlugin.releaseAllContexts();
      } catch (e) {}
    }
    this._isLoaded = false; 
    // It will be lazily loaded next time getActiveModel is called, or we can just preload.
    this.notify();
  }

  getActiveModelInfo(): LocalAIModel | undefined {
    return this._models.find(m => m.id === this._activeModelId);
  }

  async isModelInstalled(modelId?: string): Promise<boolean> {
    const id = modelId || this._activeModelId;
    if (!id) return false;

    if (!this._installedCache.has(id)) {
      await this.refreshInstalledStatus();
    }
    return this._installedCache.get(id) || false;
  }

  async deleteModel(modelId?: string): Promise<void> {
    const id = modelId || this._activeModelId;
    if (!id) return;

    const modelToDelete = this._models.find(m => m.id === id);
    if (!modelToDelete) return;

    try {
      if (id === this._activeModelId) {
         if (this.isNative && this.nativeContextId !== -1) {
           await LlamaPlugin.releaseAllContexts();
         }
         this._isLoaded = false;
      }
      
      await Filesystem.deleteFile({
        directory: Directory.Data,
        path: modelToDelete.filename,
      });

      this._installedCache.set(id, false);
      this._installedSizes.set(id, 0);

      // If active is deleted, we keep it as active (so that they can redownload), or we can unset it.
      // Keeping it as active but showing "Download Required" is better UX.
      this.failed = false;
      this.notify();
    } catch (e) {
      console.warn("Model already deleted or could not delete", e);
    }
  }

  abortDownload() {
    if (this._isLoading) {
      this._cancelFlag = true;
    }
  }

  async downloadModel(model: LocalAIModel): Promise<void> {
    if (this._isLoading) return;
    this._isLoading = true;
    this.failed = false;
    
    // Auto-add to library if not there
    await this.addModelToLibrary(model);

    // Auto-set as active if there's no active model
    if (!this._activeModelId) {
        await this.setActiveModel(model.id);
    }

    this._downloadInfo = { activeModelId: model.id, bytes: 0, total: model.sizeBytes };
    this._downloadProgress = 0;
    this._cancelFlag = false;
    this.notify();

    try {
      await this.ensureNativeModel(model);
      this._installedCache.set(model.id, true);
    } catch (e) {
      console.error("Failed to download model", e);
      this.failed = true;
      throw e; // Rethrow to let UI catch it
    } finally {
      this._isLoading = false;
      this._downloadProgress = 0;
      this._downloadInfo = null;
      this.notify();
    }
  }

  private async ensureNativeModel(model: LocalAIModel): Promise<string> {
    const dir = Directory.Data;
    const path = model.filename;

    try {
      const stat = await Filesystem.stat({ directory: dir, path });
      if (stat.size > 0) {
        const uri = await Filesystem.getUri({ directory: dir, path });
        return uri.uri.replace("file://", "");
      }
    } catch (e) {
      // File doesn't exist, proceed to download
    }

    console.log("[LocalAIService] Downloading GGUF model...", model.name);
    this._downloadProgress = 1;
    this._downloadInfo = { activeModelId: model.id, bytes: 0, total: model.sizeBytes };
    this.notify();

    return new Promise<string>(async (resolve, reject) => {
      let listener: any = null;
      let isDone = false;

      const finishAndResolve = async () => {
        if (isDone) return;
        isDone = true;
        if (listener) listener.remove();

        this._downloadProgress = 100;
        this._installedCache.set(model.id, true);
        this._installedSizes.set(model.id, model.sizeBytes); // or whatever actual downloaded size is

        try {
          const uri = await Filesystem.getUri({ directory: dir, path });
          if (this._cancelFlag) {
            console.warn("[LocalAIService] Download finished but was soft-cancelled. Deleting file...");
            await Filesystem.deleteFile({ directory: dir, path });
            this._installedCache.set(model.id, false);
            this._installedSizes.set(model.id, 0);
            this._cancelFlag = false;
            reject(new Error("Download aborted"));
            this.notify();
            return;
          }

          this.notify();
          resolve(uri.uri.replace("file://", ""));
        } catch (e) {
          if (this._cancelFlag) {
             this._cancelFlag = false;
             reject(new Error("Download aborted"));
             return;
          }
          reject(e);
        }
      };

      try {
        listener = await Filesystem.addListener("progress", (status: any) => {
          if (this._cancelFlag) {
             // UI stops updating to give the illusion of cancel, file continues in background
             if (!isDone) {
                 isDone = true;
                 if (listener) listener.remove();
                 reject(new Error("Download aborted"));
             }
             return;
          }
          if (status.url && status.url !== model.hfUrl) return;
          if (status.contentLength && status.contentLength > 0) {
            this._downloadInfo = {
                activeModelId: model.id,
                bytes: status.bytes,
                total: status.contentLength
            };

            const pct = Math.round((status.bytes / status.contentLength) * 100);
            if (pct !== this._downloadProgress && pct <= 100) {
              this._downloadProgress = pct;
              this.notify();
            } else {
              // still notify bytes update
              this.notify();
            }
            if (status.bytes >= status.contentLength) {
              finishAndResolve();
            }
          }
        });

        Filesystem.downloadFile({
          url: model.hfUrl,
          path: path,
          directory: dir,
          progress: true,
        }).then(
          () => finishAndResolve(),
          (error) => {
            if (!isDone) {
              isDone = true;
              if (listener) listener.remove();
              console.error("[LocalAIService] Failed to download model", error);
              reject(error);
            }
          }
        );
      } catch (error) {
        if (!isDone) {
          isDone = true;
          if (listener) listener.remove();
          console.error("[LocalAIService] Failed to start model download", error);
          reject(error);
        }
      }
    });
  }

  async init(): Promise<void> {
    if (this._isLoaded) return;
    
    const activeModel = this.getActiveModelInfo();
    if (!activeModel) throw new Error("No active model selected");

    if (!(await this.isModelInstalled(activeModel.id))) {
      throw new Error(`Model ${activeModel.name} is selected but not downloaded.`);
    }

    this._isLoading = true;
    this.notify();

    try {
      if (this.isNative) {
        try {
          const absolutePath = await this.ensureNativeModel(activeModel);
          console.log("[LocalAIService] Initializing Native Llama context:", absolutePath);

          await LlamaPlugin.releaseAllContexts();

          this.nativeContextId = Math.floor(Math.random() * 10000);
          await LlamaPlugin.initContext({
            id: this.nativeContextId,
            model: absolutePath,
            n_ctx: 1024,
            n_threads: 2,
            use_mmap: true,
            use_mlock: false,
          });
        } catch (nativeErr) {
          console.warn(
            "[LocalAIService] Native Llama init failed or timed out. WASM fallback disabled on mobile.",
            nativeErr,
          );
          this.isNative = false;
          throw new Error("Local AI is not supported on this device architecture.");
        }
      }

      if (!this.isNative) {
        getWorker();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      this._isLoaded = true;
    } catch (e: any) {
      console.error("[LocalAIService] Failed to load model:", e);
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
                const tokenStr = event.tokenResult?.token || (event.tokenResult as any)?.text || "";
                if (tokenStr) {
                  options.onToken?.(tokenStr);
                }
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
            emit_partial_completion: !!options.onToken,
          },
        });

        if (tokenListener) await tokenListener.remove();

        return (res.content || res.text || "").trim();
      } else {
        return await this.generateWasm(prompt, { ...options, onToken: undefined });
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
    const systemPrompt = "You are a communication assistant. Your goal is to keep the conversation flowing.";

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
        maxNewTokens: 54,
        temperature: 0.5,
      },
    );

    return parseBulletList(raw, limit);
  }

  async summarize(messages: ChatMessage[], limit: number): Promise<string> {
    const meaningful = messages.filter((m) => (m.text || "").trim().length >= 4);

    if (meaningful.length === 0) return "Not enough content to summarize.";

    const context = meaningful
      .slice(-20)
      .map((m) => `${m.sender === "me" ? "Me" : "Peer"}: ${m.text!.trim()}`)
      .join("\n");

    const systemPrompt = "You extract key facts from chat logs. Output bullet points only. Never add anything not explicitly stated in the chat.";

    const userContent =
      `Example:\nChat:\nMe: can we move the meeting to 3pm?\nPeer: sure, also bring the Q3 report\nMe: will do\n` +
      `Bullets:\n- Meeting moved to 3 PM\n- Peer requested Q3 report\n\n` +
      `Now do the same for this chat:\nChat:\n${context}\n` +
      `Bullets (max ${Math.max(3, limit)}, only facts from above):\n-`;

    const raw = await this.generate(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      { maxNewTokens: 180, temperature: 0.1 },
    );

    const trimmed = raw.trim();
    return trimmed.startsWith("-") ? trimmed : `- ${trimmed}`;
  }

  async summarizeSingleMessage(text: string): Promise<string> {
    if (!text || text.trim().length < 20) return "Message is too short to summarize.";

    const systemPrompt = "You rephrase a single message into a clear, concise summary. Use plain English. Output one or two sentences only. Never add anything not in the message.";

    const userContent =
      `Example:\nMessage: "Hey sorry I missed your call earlier, I was in a meeting until like 3:30 and then had to run to pick up the kids. Can we catch up tomorrow morning maybe around 9 or 10?"\n` +
      `Summary: Missed the call due to a meeting and errands. Suggests catching up tomorrow around 9–10 AM.\n\n` +
      `Now summarize this message:\nMessage: "${text.trim()}"\nSummary:`;

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
    const systemPrompt = "You are a professional editor. Rewrite the input to be clear and polite, but keep it brief.";
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

export const localAIService = new LocalAIService();
