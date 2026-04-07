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

const MIME_BY_EXTENSION: Record<string, string> = {
  aac: "audio/aac",
  avi: "video/x-msvideo",
  bmp: "image/bmp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  flac: "audio/flac",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  "3g2": "video/3gpp2",
  "3gp": "video/3gpp",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  m4a: "audio/mp4",
  m4v: "video/x-m4v",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  ogv: "video/ogg",
  opus: "audio/opus",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  avif: "image/avif",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
};

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

export const getFileExtension = (name?: string): string => {
  const parts = (name || "").toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

export const getMimeTypeForFileLike = (
  file: FileLike,
  defaultMime = "application/octet-stream",
): string => {
  const extension = getFileExtension(file.name);

  if ((file.name || "").includes("voice-note") && extension === "webm") {
    return "audio/webm";
  }

  return file.type || MIME_BY_EXTENSION[extension] || defaultMime;
};

export const isWordDocumentFileLike = (file: FileLike): boolean => {
  const type = getNormalizedType(file.type);
  const extension = getFileExtension(file.name);

  return (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  );
};

export const isPdfFileLike = (file: FileLike): boolean => {
  const type = getNormalizedType(file.type);
  return (type === "application/pdf" || getFileExtension(file.name) === "pdf") &&
    !isWordDocumentFileLike(file);
};

export const isTextFileLike = (
  file: FileLike,
  options?: { fallbackToUnknown?: boolean },
): boolean => {
  const type = getNormalizedType(file.type);

  if (
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/javascript"
  ) {
    return true;
  }

  if (!options?.fallbackToUnknown) {
    return false;
  }

  return !isPdfFileLike(file) && !isWordDocumentFileLike(file);
};

export const isImageFileLike = (file: FileLike): boolean => {
  const type = getNormalizedType(file.type);
  return type.startsWith("image/") || IMAGE_EXTENSIONS.has(getFileExtension(file.name));
};

export const isVideoFileLike = (file: FileLike): boolean => {
  const type = getNormalizedType(file.type);
  return type.startsWith("video/") || VIDEO_EXTENSIONS.has(getFileExtension(file.name));
};

export const isAudioFileLike = (file: FileLike): boolean => {
  if (isVideoFileLike(file)) return false;

  const type = getNormalizedType(file.type);
  return type.startsWith("audio/") || AUDIO_EXTENSIONS.has(getFileExtension(file.name));
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

  const extension = getFileExtension(file.name);
  const normalizedType = VIDEO_MIME_BY_EXTENSION[extension] || "video/mp4";

  return new File([file], file.name, {
    type: normalizedType,
    lastModified: file.lastModified,
  });
};
