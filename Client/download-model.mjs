import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import { finished } from "stream/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://huggingface.co";

const MODELS = [
  {
    id: "Xenova/Qwen1.5-0.5B-Chat",
    files: [
      "config.json",
      "generation_config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "special_tokens_map.json",
      "onnx/decoder_model_merged_quantized.onnx",
    ],
  },
  {
    id: "Xenova/all-MiniLM-L6-v2",
    files: [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "special_tokens_map.json",
      "vocab.txt",
      "onnx/model_quantized.onnx",
    ],
  },
];

async function downloadFile(url, dest) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`Skipping ${path.basename(dest)} - already exists`);
    return;
  }

  console.log(`Downloading ${url}...`);
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      console.warn(`File not found: ${url} (skipping)`);
      return;
    }
    throw new Error(
      `Failed to download ${url}: ${response.status} ${response.statusText}`,
    );
  }

  const fileStream = fs.createWriteStream(dest, { flags: "w" });
  await finished(Readable.fromWeb(response.body).pipe(fileStream));
  console.log(`Downloaded ${path.basename(dest)}`);
}

async function main() {
  for (const model of MODELS) {
    console.log(`Processing model: ${model.id}`);
    const outputDir = path.join(__dirname, "public", "models", model.id);
    const modelBaseUrl = `${BASE_URL}/${model.id}/resolve/main`;

    for (const file of model.files) {
      const url = `${modelBaseUrl}/${file}`;
      const dest = path.join(outputDir, file);
      try {
        await downloadFile(url, dest);
      } catch (e) {
        console.error(`Error downloading ${file}:`, e.message);
      }
    }
  }

  console.log("Download complete!");
}

main();
