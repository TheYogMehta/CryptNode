type FileLike = {
  name?: string;
  type?: string;
};

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg",
  "avif",
  "heic",
  "heif",
]);

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "m4v",
  "webm",
  "mkv",
  "avi",
  "3gp",
  "3g2",
  "ogv",
]);

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "m4a",
  "aac",
  "wav",
  "ogg",
  "oga",
  "flac",
  "opus",
]);

const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
  "3g2": "video/3gpp2",
  "3gp": "video/3gpp",
  avi: "video/x-msvideo",
  m4v: "video/x-m4v",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp4: "video/mp4",
  ogv: "video/ogg",
  webm: "video/webm",
};

const getNormalizedType = (type?: string): string => (type || "").toLowerCase();

const getExtension = (name?: string): string => {
  const parts = (name || "").toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

export const isImageFileLike = (file: FileLike): boolean => {
  const type = getNormalizedType(file.type);
  return type.startsWith("image/") || IMAGE_EXTENSIONS.has(getExtension(file.name));
};

export const isVideoFileLike = (file: FileLike): boolean => {
  const type = getNormalizedType(file.type);
  return type.startsWith("video/") || VIDEO_EXTENSIONS.has(getExtension(file.name));
};

export const isAudioFileLike = (file: FileLike): boolean => {
  if (isVideoFileLike(file)) return false;

  const type = getNormalizedType(file.type);
  return type.startsWith("audio/") || AUDIO_EXTENSIONS.has(getExtension(file.name));
};

export const getUploadPreviewType = (
  file: FileLike,
): "image" | "video" | "unknown" => {
  if (isImageFileLike(file)) return "image";
  if (isVideoFileLike(file)) return "video";
  return "unknown";
};

export const getMessageTypeForUpload = (
  file: FileLike,
): "image" | "video" | "audio" | "file" => {
  if (isImageFileLike(file)) return "image";
  if (isVideoFileLike(file)) return "video";
  if (isAudioFileLike(file)) return "audio";
  return "file";
};

export const normalizeSelectedUploadFile = (file: File): File => {
  if (!isVideoFileLike(file) || getNormalizedType(file.type).startsWith("video/")) {
    return file;
  }

  const extension = getExtension(file.name);
  const normalizedType = VIDEO_MIME_BY_EXTENSION[extension] || "video/mp4";

  return new File([file], file.name, {
    type: normalizedType,
    lastModified: file.lastModified,
  });
};
