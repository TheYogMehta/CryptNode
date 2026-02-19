import {
  pipeline,
  env,
  Pipeline,
  TextGenerationPipeline,
} from "@xenova/transformers";

// Configure environment
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useBrowserCache = false;
env.localModelPath = "/models";

const MODEL_ID = "Xenova/Qwen1.5-0.5B-Chat";

// Pipeline instance
let generator: Promise<TextGenerationPipeline | Pipeline> | null = null;

// Message types
type WorkerMessage =
  | { type: "init" }
  | {
      type: "generate";
      prompt: string;
      options: any;
      id: string;
    };

// Initialize the model
async function getPipeline() {
  if (generator) return generator;

  console.log("[QwenWorker] Initializing model...");
  generator = pipeline("text-generation", MODEL_ID, {
    device: "webgpu",
  } as any)
    .then((p) => {
      console.log("[QwenWorker] Model loaded successfully (WebGPU)");
      return p;
    })
    .catch(async (e) => {
      console.warn("[QwenWorker] WebGPU failed, falling back to WASM/CPU", e);
      return pipeline("text-generation", MODEL_ID, {
        device: "wasm",
      } as any);
    });

  return generator;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  try {
    switch (msg.type) {
      case "init":
        await getPipeline();
        self.postMessage({ type: "init_result", success: true });
        break;

      case "generate":
        const pipe = await getPipeline();
        if (!pipe) throw new Error("Pipeline not initialized");

        // Handle streaming callbacks
        const callback_function = (beams: any) => {
          try {
            const tokenizer = (pipe as any).tokenizer;
            const tokenIds = beams[0].output_token_ids;
            const decoded = tokenizer.decode(tokenIds, {
              skip_special_tokens: true,
            });
            self.postMessage({
              type: "token",
              id: msg.id,
              token: decoded,
            });
          } catch (err) {
            // ignore
          }
        };

        const output = await pipe(msg.prompt, {
          ...msg.options,
          callback_function,
        });

        self.postMessage({
          type: "generate_result",
          id: msg.id,
          output,
        });
        break;
    }
  } catch (err: any) {
    console.error("[QwenWorker] Error:", err);
    self.postMessage({
      type: "error",
      id: (msg as any).id,
      error: err.message,
    });
  }
};
