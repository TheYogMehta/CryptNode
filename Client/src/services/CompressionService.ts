export class CompressionService {
  public static async compress(
    data: ArrayBufferLike | ArrayBufferView | string,
  ): Promise<ArrayBuffer> {
    const stream = new CompressionStream("gzip");
    const writer = stream.writable.getWriter();

    const input =
      typeof data === "string" ? new TextEncoder().encode(data) : data;

    writer.write(input as any);
    writer.close();

    return new Response(stream.readable).arrayBuffer();
  }

  public static async decompress(
    data: ArrayBuffer,
    asString: boolean = true,
  ): Promise<string | ArrayBuffer> {
    const stream = new DecompressionStream("gzip");
    const writer = stream.writable.getWriter();

    writer.write(data);
    writer.close();

    const outputBuffer = await new Response(stream.readable).arrayBuffer();

    if (asString) {
      return new TextDecoder().decode(outputBuffer);
    }
    return outputBuffer;
  }
}
