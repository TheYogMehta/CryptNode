import type { ChatMessage } from "../../pages/Home/types";

const MODEL_ID = "Xenova/Qwen1.5-0.5B-Chat";

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

import {
  pipeline,
  env,
  Pipeline,
  TextGenerationPipeline,
} from "@xenova/transformers";

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useBrowserCache = false;
env.localModelPath = "/models";

let pipelinePromise: Promise<TextGenerationPipeline | Pipeline> | null = null;

function getPipeline(): Promise<TextGenerationPipeline | Pipeline> {
  if (pipelinePromise) return pipelinePromise;

  console.log("[QwenLocalService] Initializing model...");
  pipelinePromise = pipeline("text-generation", MODEL_ID, {
    device: "webgpu",
  } as any)
    .then((p) => {
      console.log("[QwenLocalService] Model loaded successfully (WebGPU)");
      return p;
    })
    .catch(async (e) => {
      console.warn(
        "[QwenLocalService] WebGPU failed, falling back to WASM/CPU",
        e,
      );
      return pipeline("text-generation", MODEL_ID, {
        device: "wasm",
      } as any);
    });

  return pipelinePromise;
}

export class QwenLocalService {
  private failed = false;
  private _isLoaded = false;
  private _isLoading = false;

  get isLoaded() {
    return this._isLoaded;
  }
  get isLoading() {
    return this._isLoading;
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

  async init(): Promise<void> {
    if (this._isLoaded) return;
    this._isLoading = true;
    this.notify();
    try {
      await getPipeline();
      this._isLoaded = true;
    } catch (e) {
      console.error("[QwenLocalService] Failed to load model", e);
      this.failed = true;
    } finally {
      this._isLoading = false;
      this.notify();
    }
  }
  async generate(
    messages: { role: string; content: string }[],
    options: QwenGenerationOptions & { onToken?: (token: string) => void } = {},
  ): Promise<string> {
    if (this.failed) return "";
    this._isLoading = true;
    this.notify();
    try {
      const generator = await getPipeline();
      this._isLoaded = true;
      if (!generator) return "";
      const prompt =
        messages
          .map((m) => `<|im_start|>${m.role}\n${m.content}<|im_end|>`)
          .join("\n") + "\n<|im_start|>assistant\n";

      // Cast options to any to avoid type error with callback_function
      const generationOptions: any = {
        max_new_tokens: options.maxNewTokens ?? 128,
        temperature: options.temperature ?? 0.2,
        top_p: options.topP ?? 0.9,
        do_sample: true,
        return_full_text: false,
        callback_function: (beams: any) => {
          if (options.onToken) {
            try {
              const tokenizer = generator.tokenizer;
              const tokenIds = beams[0].output_token_ids;
              const decoded = tokenizer.decode(tokenIds, {
                skip_special_tokens: true,
              });
              options.onToken(decoded);
            } catch (err) {
              // ignore
            }
          }
        },
      };

      const out = await generator(prompt, generationOptions);

      console.log("[QwenLocalService] Raw output:", out);
      return extractText(out).trim();
    } catch (e) {
      console.error("[QwenLocalService] Generate failed", e);
      return "";
    } finally {
      this._isLoading = false;
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
