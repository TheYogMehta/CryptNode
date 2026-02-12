import pako from "pako";

export class CompressionService {
  public static async compress(
    data: ArrayBufferLike | ArrayBufferView | string,
  ): Promise<ArrayBuffer> {
    const input =
      typeof data === "string" ? new TextEncoder().encode(data) : data;
    return pako.gzip(input as Uint8Array).buffer;
  }

  public static async decompress(
    data: ArrayBuffer,
    asString: boolean = true,
  ): Promise<string | ArrayBuffer> {
    const decompressed = pako.ungzip(new Uint8Array(data));
    if (asString) {
      return new TextDecoder().decode(decompressed);
    }
    return decompressed.buffer;
  }

  public static async compressBlob(blob: Blob): Promise<Blob> {
    const arrayBuffer = await blob.arrayBuffer();
    const compressed = pako.gzip(new Uint8Array(arrayBuffer));
    return new Blob([compressed], { type: blob.type });
  }

  public static async decompressBlob(blob: Blob): Promise<Blob> {
    const arrayBuffer = await blob.arrayBuffer();
    const decompressed = pako.ungzip(new Uint8Array(arrayBuffer));
    return new Blob([decompressed], { type: blob.type });
  }
}
