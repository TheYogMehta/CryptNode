import CryptoWorker from "../workers/crypto.worker?worker";

export class WorkerManager {
  private static instance: WorkerManager;
  private highPriorityWorker: WorkerPool;
  private mediumPriorityWorker: WorkerPool;
  private lowPriorityWorker: WorkerPool;

  private constructor() {
    this.highPriorityWorker = new WorkerPool(new CryptoWorker());
    this.mediumPriorityWorker = new WorkerPool(new CryptoWorker());
    this.lowPriorityWorker = new WorkerPool(new CryptoWorker());
  }

  public static getInstance(): WorkerManager {
    if (!WorkerManager.instance) {
      WorkerManager.instance = new WorkerManager();
    }
    return WorkerManager.instance;
  }

  public async initSession(sid: string, keyJWK: JsonWebKey) {
    const msg = { type: "INIT_SESSION", sid, keyJWK };
    await Promise.all([
      this.highPriorityWorker.postMessage(msg),
      this.mediumPriorityWorker.postMessage(msg),
      this.lowPriorityWorker.postMessage(msg),
    ]);
  }

  public async encrypt(
    sid: string,
    data: string | ArrayBuffer,
    priority: number,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const msg = { type: "ENCRYPT", sid, data, id, priority };
    return this.getWorker(priority).postMessage(msg);
  }

  public async decrypt(
    sid: string,
    data: string,
    priority: number,
  ): Promise<ArrayBuffer> {
    const id = crypto.randomUUID();
    const msg = { type: "DECRYPT", sid, data, id, priority };
    return this.getWorker(priority).postMessage(msg);
  }

  private getWorker(priority: number): WorkerPool {
    if (priority === 0) return this.highPriorityWorker;
    if (priority === 2) return this.lowPriorityWorker;
    return this.mediumPriorityWorker;
  }
}

class WorkerPool {
  private worker: Worker;
  private callbacks: Map<
    string,
    { resolve: (data: any) => void; reject: (err: any) => void }
  > = new Map();

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (e) => this.handleMessage(e.data);
  }

  private handleMessage(msg: any) {
    const callback = this.callbacks.get(msg.id);
    if (callback) {
      if (msg.error) {
        callback.reject(new Error(msg.error));
      } else {
        if (msg.type === "ENCRYPT_RESULT" || msg.type === "DECRYPT_RESULT") {
          callback.resolve(msg.data);
        }
      }
      this.callbacks.delete(msg.id);
    }
  }

  public postMessage(msg: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (msg.type === "ENCRYPT" || msg.type === "DECRYPT") {
        this.callbacks.set(msg.id, { resolve, reject });
      }
      this.worker.postMessage(msg);
      if (msg.type === "INIT_SESSION") {
        resolve(true);
      }
    });
  }
}
