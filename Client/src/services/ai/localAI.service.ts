import { Filesystem, Directory } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";
import type { ChatMessage } from "../../pages/Home/types";
import { LocalAIModel, RECOMMENDED_MODELS } from "./models";

declare global {
  interface Window {
    Capacitor?: any;
    llama?: {
      init: (modelPath: string) => Promise<{ success: boolean; error?: string }>;
      generate: (prompt: string, options: any, id: string) => Promise<{ success: boolean; output?: string; error?: string }>;
      onToken: (callback: (data: { id: string; token: string }) => void) => void;
      checkData: (filename: string) => Promise<{ exists: boolean, size: number, path: string }>;
      delete: (filename: string) => Promise<{ success: boolean, error?: string }>;
      download: (url: string, filename: string, id: string) => Promise<{ success: boolean, path?: string, error?: string }>;
      clearChat: () => Promise<{ success: boolean }>;
      cancelDownload: (id: string) => Promise<{ success: boolean }>;
      onDownloadProgress: (callback: (data: { id: string; bytes: number; total: number }) => void) => void;
    };
  }
}

interface QwenGenerationOptions {
  maxNewTokens?: number;
  temperature?: number;
  topP?: number;
}

function clipContext(draft: string): string {
  return draft ? `Draft: ${draft}` : "";
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

const pendingRequests: Record<
  string,
  {
    resolve: (data: any) => void;
    reject: (err: any) => void;
    onToken?: (token: string) => void;
  }
> = {};

let isLlamaInitialized = false;

function initLlamaListener() {
  if (isLlamaInitialized || !window.llama) return;
  window.llama.onToken((data) => {
    const req = pendingRequests[data.id];
    if (req && req.onToken) {
      req.onToken(data.token);
    }
  });
  window.llama.onDownloadProgress((data) => {
    const req = pendingRequests[data.id];
    if (req && req.onToken) {
      // Re-using onToken just as a general event bus payload for now, or handled explicitly below
    }
  });
  isLlamaInitialized = true;
}

export interface StoredModel extends LocalAIModel {
  isDownloaded: boolean;
  downloadedBytes: number;
}

export class LocalAIService {
  private _isLoaded = false;
  private _isLoading = false;
  public failed = false;
  private _downloadProgress = 0;
  private _installedCache = new Map<string, boolean>();
  private _installedSizes = new Map<string, number>();
  private _downloadInfo: { activeModelId: string, bytes: number, total: number } | null = null;
  private _cancelFlag = false;
  private _refreshingPromise: Promise<void> | null = null;

  private _models: LocalAIModel[] = [];
  private _activeModelId: string | null = null;

  constructor() {
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
      } else {
        this._activeModelId = null;
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
      try {
        if (window.llama) {
          for (const model of this._models) {
            const res = await window.llama.checkData(model.filename);
            this._installedCache.set(model.id, res.exists);
            this._installedSizes.set(model.id, res.size);
          }
        } else {
          const dirData = await Filesystem.readdir({ directory: Directory.Data, path: "" });
          const existingFiles = new Set(dirData.files.map((f: any) => typeof f === "string" ? f : f.name));

          for (const model of this._models) {
            if (existingFiles.has(model.filename)) {
              this._installedCache.set(model.id, true);
              try {
                const stat = await Filesystem.stat({ directory: Directory.Data, path: model.filename });
                this._installedSizes.set(model.id, stat.size || 0);
              } catch (e) {
                this._installedSizes.set(model.id, model.sizeBytes || 0);
              }
            } else {
              this._installedCache.set(model.id, false);
              this._installedSizes.set(model.id, 0);
            }
          }
        }
      } catch (e) {
        // Fallback
        for (const model of this._models) {
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

    if (id === this._activeModelId) {
      this._isLoaded = false;
      this._activeModelId = null;
      await this.saveStateToPreferences();
    }

    try {
      if (window.llama) {
        await window.llama.delete(modelToDelete.filename);
      } else {
        await Filesystem.deleteFile({
          directory: Directory.Data,
          path: modelToDelete.filename,
        }).catch(() => { });
        await Filesystem.deleteFile({
          directory: Directory.Data,
          path: modelToDelete.filename + ".part",
        }).catch(() => { });
      }
    } catch (e) {
      console.warn("Model already deleted or could not delete", e);
    }

    this._installedCache.set(id, false);
    this._installedSizes.set(id, 0);

    this.failed = false;
    this.notify();
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
    if (window.llama) {
      initLlamaListener();
      const check = await window.llama.checkData(model.filename);
      if (check.exists) {
        return check.path;
      }

      console.log("[LocalAIService] Downloading GGUF model natively...", model.name);
      this._downloadProgress = 1;
      this._downloadInfo = { activeModelId: model.id, bytes: 0, total: model.sizeBytes };
      this.notify();

      return new Promise<string>(async (resolve, reject) => {
        const dlId = Math.random().toString(36).substring(7);
        let isDone = false;
        const llamaInstance = window.llama!;

        const handleProgress = (event: any) => {
          const data = event.detail;
          if (data.id !== dlId) return;

          if (this._cancelFlag) {
            if (!isDone) {
              isDone = true;
              window.removeEventListener("llama:download-progress-dispatch", handleProgress);
              llamaInstance.cancelDownload(dlId);
              reject(new Error("Download aborted"));
            }
            return;
          }

          if (data.total > 0) {
            this._downloadInfo = {
              activeModelId: model.id,
              bytes: data.bytes,
              total: data.total
            };
            const pct = Math.round((data.bytes / data.total) * 100);
            if (pct !== this._downloadProgress && pct <= 100) {
              this._downloadProgress = pct;
              this.notify();
            } else {
              this.notify();
            }
          }
        };

        window.addEventListener("llama:download-progress-dispatch", handleProgress);

        if (!llamaInstance.onDownloadProgress) {
          console.warn("Missing onDownloadProgress");
        } else {
          // Ensure the base listener dispatches a custom event for local scoping
          if (!isLlamaInitialized) {
            initLlamaListener();
          }
          const fn = (window as any)._llamaDlListenerSetup;
          if (!fn) {
            (window as any)._llamaDlListenerSetup = true;
            llamaInstance.onDownloadProgress((data) => {
              window.dispatchEvent(new CustomEvent("llama:download-progress-dispatch", { detail: data }));
            });
          }
        }

        try {
          const dlRes = await llamaInstance.download(model.hfUrl, model.filename, dlId);
          window.removeEventListener("llama:download-progress-dispatch", handleProgress);
          isDone = true;

          if (this._cancelFlag) {
            this._cancelFlag = false;
            await llamaInstance.delete(model.filename);
            this._installedCache.set(model.id, false);
            reject(new Error("Download aborted"));
            return;
          }

          if (!dlRes.success) {
            reject(new Error(dlRes.error || "Failed to download model"));
            return;
          }

          this._downloadProgress = 100;
          this._installedCache.set(model.id, true);
          this._installedSizes.set(model.id, model.sizeBytes);
          resolve(dlRes.path || "");
        } catch (err) {
          window.removeEventListener("llama:download-progress-dispatch", handleProgress);
          isDone = true;
          reject(err);
        }
      });
    }

    const dir = Directory.Data;
    const path = model.filename;

    try {
      const dirData = await Filesystem.readdir({ directory: dir, path: "" });
      const exists = dirData.files.some((f: any) => (typeof f === "string" ? f : f.name) === path);
      if (exists) {
        const uri = await Filesystem.getUri({ directory: dir, path });
        return uri.uri.replace("file://", "");
      }
    } catch (e) {
      // Fallback
      try {
        const stat = await Filesystem.stat({ directory: dir, path });
        if (stat) {
          const uri = await Filesystem.getUri({ directory: dir, path });
          return uri.uri.replace("file://", "");
        }
      } catch (err) { }
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
          try {
            await Filesystem.rename({ directory: dir, from: path + ".part", to: path });
          } catch (e) { }

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
          }
        });

        Filesystem.downloadFile({
          url: model.hfUrl,
          path: path + ".part",
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

    const wasLoading = this._isLoading;
    const prevProgress = this._downloadProgress;
    this._isLoading = true;
    this.notify();

    try {
      if (!window.llama) {
        throw new Error("Native AI features are only supported on Windows and Linux currently.");
      }

      const modelPath = await this.ensureNativeModel(activeModel);
      initLlamaListener();

      const initResult = await window.llama.init(modelPath);
      if (!initResult.success) {
        throw new Error(initResult.error || "Failed to initialize LLM");
      }

      this._isLoaded = true;
    } catch (e: any) {
      console.error("[LocalAIService] Failed to load model:", e);
      if (e.message && e.message.includes("not supported")) {
        throw e;
      }
      throw e;
    } finally {
      this._isLoading = wasLoading;
      this._downloadProgress = prevProgress;
      this.notify();
    }
  }

  async clearSession(): Promise<void> {
    if (window.llama && window.llama.clearChat) {
      await window.llama.clearChat();
    }
  }

  private async generateWasm(
    prompt: string,
    options: QwenGenerationOptions & { onToken?: (token: string) => void },
  ): Promise<string> {
    if (!window.llama) {
      throw new Error("Native AI features are only supported on Windows and Linux currently.");
    }
    const llamaInstance = window.llama;

    const id = Math.random().toString(36).substring(7);

    return await new Promise<string>(async (resolve, reject) => {
      pendingRequests[id] = {
        resolve: (output: any) => {
          resolve(extractText(output).trim());
        },
        reject,
        onToken: options.onToken,
      };

      try {
        const res = await llamaInstance.generate(prompt, {
          max_new_tokens: options.maxNewTokens ?? 128,
          temperature: options.temperature ?? 0.2,
          top_p: options.topP ?? 0.9,
          do_sample: true,
          return_full_text: false,
        }, id);

        if (!res.success) {

          reject(new Error(res.error || "Failed to generate"));
          delete pendingRequests[id];
          return;
        }

        const output = res.output;
        const req = pendingRequests[id];
        if (req) {
          req.resolve(output);
          delete pendingRequests[id];
        }
      } catch (err) {
        reject(err);
        delete pendingRequests[id];
      }
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
    draft: string,
    limit: number,
  ): Promise<string[]> {
    const context = clipContext(draft);
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
