export interface LocalAIModel {
  id: string;
  name: string;
  description: string;
  hfUrl: string;
  filename: string;
  sizeBytes: number;
}

export const RECOMMENDED_MODELS: LocalAIModel[] = [
  {
    id: "qwen-3.5-0.8b-q4",
    name: "Qwen 3.5 0.8B (Q4)",
    description: "Extremely fast and lightweight model. Perfect for quick tasks on older devices.",
    hfUrl: "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf",
    filename: "Qwen3.5-0.8B-Q4_K_M.gguf",
    sizeBytes: 532517120, // ~500 MB
  },
  {
    id: "llama-3.2-1b-instruct-q4",
    name: "Llama 3.2 1B Instruct (Q4)",
    description: "Meta's efficient 1B model. Great balance of speed and conversational reasoning.",
    hfUrl: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    filename: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    sizeBytes: 813000000, // ~775 MB
  },
  {
    id: "qwen-2.5-1.5b-instruct-q4",
    name: "Qwen 2.5 1.5B Instruct (Q4)",
    description: "Highly capable model for complex instructions, excelling in multi-turn conversations.",
    hfUrl: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
    filename: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    sizeBytes: 1120000000, // ~1.05 GB
  },
  {
    id: "phi-3-mini-4k-instruct-q4",
    name: "Phi-3 Mini 4K Instruct (Q4)",
    description: "Microsoft's powerful 3.8B model. Excellent reasoning abilities, but requires 3GB+ RAM.",
    hfUrl: "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf",
    filename: "Phi-3-mini-4k-instruct-q4.gguf",
    sizeBytes: 2390000000, // ~2.2 GB
  }
];
