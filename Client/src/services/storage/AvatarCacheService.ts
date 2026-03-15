import { StorageService } from "./StorageService";

type BustListener = (cleanUrl: string) => void;

class AvatarCacheService {
  private cache = new Map<string, string>();
  private pendingRequests = new Map<string, Promise<string | null>>();
  private listeners = new Set<BustListener>();

  async getAvatar(avatarUrl: string | undefined | null): Promise<string | null> {
    if (!avatarUrl) return null;

    if (avatarUrl.startsWith("data:") || avatarUrl.startsWith("http")) {
      return avatarUrl;
    }

    // Normalise — strip .jpg so "sid" and "sid.jpg" share the same cache key
    const cleanUrl = avatarUrl.replace(/\.jpg$/, "");

    if (this.cache.has(cleanUrl)) {
      return this.cache.get(cleanUrl) || null;
    }

    if (this.pendingRequests.has(cleanUrl)) {
      return this.pendingRequests.get(cleanUrl) || null;
    }

    const request = StorageService.getProfileImage(cleanUrl).then((src) => {
      this.pendingRequests.delete(cleanUrl);
      if (src) {
        // Only cache successes — null means the file isn't ready yet,
        // so we must retry once the avatar arrives.
        this.cache.set(cleanUrl, src);
      }
      return src;
    });

    this.pendingRequests.set(cleanUrl, request);
    return request;
  }

  /**
   * Remove a specific avatar from the cache so it is re-fetched on next render.
   * Also notifies all subscribers so components that already rendered can re-fetch
   * even when their avatarUrl prop hasn't changed.
   */
  bust(avatarUrl: string | undefined | null) {
    if (!avatarUrl) return;
    const cleanUrl = avatarUrl.replace(/\.jpg$/, "");
    this.cache.delete(cleanUrl);
    this.pendingRequests.delete(cleanUrl);
    // Inform all subscribed components that this avatar is now stale
    this.listeners.forEach((cb) => cb(cleanUrl));
  }

  /**
   * Subscribe to bust notifications. Returns an unsubscribe function.
   * Components should call this in a useEffect and unsubscribe on unmount.
   */
  onBust(cb: BustListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  clear() {
    this.cache.clear();
    this.pendingRequests.clear();
  }
}

export const avatarCacheService = new AvatarCacheService();
