export const getMp4FileName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return "video.mp4";

  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0) return `${trimmed}.mp4`;
  return `${trimmed.slice(0, lastDot)}.mp4`;
};

export const canRenderVideoSource = async (src: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    const inspect = () => {
      finish(video.videoWidth > 0 && video.videoHeight > 0);
    };

    const timeout = window.setTimeout(() => finish(false), 8000);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = inspect;
    video.onloadeddata = inspect;
    video.onerror = () => finish(false);
    video.src = src;
    video.load();
  });
};
