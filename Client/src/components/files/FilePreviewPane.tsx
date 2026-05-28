import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Document, Page, pdfjs } from "react-pdf";
import * as mammoth from "mammoth";
import DOMPurify from "dompurify";
import { FileText, Maximize, ZoomIn, ZoomOut } from "lucide-react";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { StorageService } from "../../services/storage/StorageService";
import {
  getFileExtension,
  getMimeTypeForFileLike,
  isAudioFileLike,
  isImageFileLike,
  isPdfFileLike,
  isTextFileLike,
  isVideoFileLike,
  isWordDocumentFileLike,
} from "../../utils/mediaType";
import { isTrustedUrl } from "../../utils/trustedDomains";
import { openExternalUrl } from "../../utils/openExternalUrl";
import { UnsafeLinkModal } from "../../pages/Home/components/chat/UnsafeLinkModal";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type FilePreviewTheme = {
  panelBackground: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  toolbarBackground: string;
  docxWorkspaceBackground: string;
  docxPaperBackground: string;
  errorColor: string;
  pageShadow: string;
};

const defaultTheme: FilePreviewTheme = {
  panelBackground: "rgba(15, 23, 42, 0.04)",
  textColor: "#111827",
  mutedTextColor: "#6b7280",
  borderColor: "rgba(15, 23, 42, 0.12)",
  toolbarBackground: "rgba(15, 23, 42, 0.04)",
  docxWorkspaceBackground: "#f8f9fa",
  docxPaperBackground: "#ffffff",
  errorColor: "#ef4444",
  pageShadow: "0 4px 12px rgba(0,0,0,0.2)",
};

export const darkFilePreviewTheme: Partial<FilePreviewTheme> = {
  panelBackground: "rgba(255, 255, 255, 0.04)",
  textColor: "#f8fafc",
  mutedTextColor: "rgba(255, 255, 255, 0.7)",
  borderColor: "rgba(255, 255, 255, 0.14)",
  toolbarBackground: "rgba(255, 255, 255, 0.08)",
  docxWorkspaceBackground: "rgba(255, 255, 255, 0.06)",
  docxPaperBackground: "#ffffff",
  errorColor: "#fca5a5",
  pageShadow: "0 12px 32px rgba(0,0,0,0.35)",
};

interface FilePreviewPaneProps {
  fileUrl: string | null;
  fileName: string;
  mimeType?: string;
  originalPath?: string | null;
  className?: string;
  style?: React.CSSProperties;
  mediaStyle?: React.CSSProperties;
  audioStyle?: React.CSSProperties;
  loadingLabel?: string;
  unsupportedLabel?: string;
  theme?: Partial<FilePreviewTheme>;
}

type PreviewKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "docx"
  | "text"
  | "unsupported";

export const FilePreviewPane: React.FC<FilePreviewPaneProps> = ({
  fileUrl,
  fileName,
  mimeType,
  originalPath,
  className,
  style,
  mediaStyle,
  audioStyle,
  loadingLabel = "Loading file preview...",
  unsupportedLabel = "Preview not available for this file type.",
  theme,
}) => {
  const mergedTheme = useMemo(
    () => ({
      ...defaultTheme,
      ...theme,
    }),
    [theme],
  );

  const normalizedMimeType = useMemo(
    () => getMimeTypeForFileLike({ name: fileName, type: mimeType }),
    [fileName, mimeType],
  );
  const file = useMemo(
    () => ({ name: fileName, type: normalizedMimeType }),
    [fileName, normalizedMimeType],
  );

  const previewKind = useMemo<PreviewKind>(() => {
    if (isImageFileLike(file)) return "image";
    if (isVideoFileLike(file)) return "video";
    if (isAudioFileLike(file)) return "audio";
    if (isPdfFileLike(file)) return "pdf";
    if (isWordDocumentFileLike(file)) return "docx";
    if (isTextFileLike(file, { fallbackToUnknown: true })) return "text";
    return "unsupported";
  }, [file]);

  const safeFileUrl = useMemo(() => {
    if (!fileUrl) return "";
    const lower = fileUrl.trim().toLowerCase();
    if (
      lower.startsWith("blob:") ||
      lower.startsWith("http://") ||
      lower.startsWith("https://") ||
      lower.startsWith("data:")
    ) {
      // Sanitize using DOMPurify with ALLOWED_URI_REGEXP to satisfy CodeQL XSS analysis
      return DOMPurify.sanitize(fileUrl, {
        ALLOWED_URI_REGEXP: /^(?:(?:https?|data|blob):|[^&:\/?#]*(?:[\/?#]|$))/i,
      });
    }
    return "";
  }, [fileUrl]);

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pdfBlobUrlRef = useRef<string | null>(null);

  const handleDocLinkClick = useCallback((e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest("a");
    if (!target) return;

    const href = target.getAttribute("href");
    if (!href || !href.startsWith("http")) return;

    e.preventDefault();
    e.stopPropagation();

    if (isTrustedUrl(href)) {
      void openExternalUrl(href);
      return;
    }

    setPendingUrl(href);
  }, []);

  useDocLinkInterceptor(contentRef, handleDocLinkClick, [content]);

  const readNativeFile = useCallback(async (path: string): Promise<ArrayBuffer> => {
    const base64Data = await StorageService.readFile(path);
    if (!base64Data) throw new Error("Empty file data");

    const binaryString = window.atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }, []);

  const readFileBuffer = useCallback(async (): Promise<ArrayBuffer> => {
    const isAndroid = Capacitor.getPlatform() === "android";

    if (isAndroid && originalPath) {
      try {
        return await readNativeFile(originalPath);
      } catch (nativeErr) {
        console.warn("Native file read failed, falling back to fetch:", nativeErr);
      }
    }

    if (!fileUrl) {
      throw new Error("Missing file URL");
    }

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error("Failed to fetch file");
    }

    return response.arrayBuffer();
  }, [fileUrl, originalPath, readNativeFile]);

  useEffect(() => {
    setContent(null);
    setError(null);
    setNumPages(0);
    setScale(1.0);

    if (pdfBlobUrlRef.current) {
      URL.revokeObjectURL(pdfBlobUrlRef.current);
      pdfBlobUrlRef.current = null;
    }
    setPdfBlobUrl(null);

    if (!fileUrl) {
      setLoading(false);
      return;
    }

    if (
      previewKind === "image" ||
      previewKind === "video" ||
      previewKind === "audio" ||
      previewKind === "unsupported"
    ) {
      setLoading(false);
      if (previewKind === "unsupported") {
        setError(unsupportedLabel);
      }
      return;
    }

    let isMounted = true;

    const loadPreview = async () => {
      setLoading(true);
      setError(null);

      try {
        const arrayBuffer = await readFileBuffer();
        if (!isMounted) return;

        if (previewKind === "pdf") {
          const blob = new Blob([arrayBuffer], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          pdfBlobUrlRef.current = url;
          setPdfBlobUrl(url);
          return;
        }

        if (previewKind === "docx") {
          const result = await mammoth.convertToHtml({ arrayBuffer });
          if (!isMounted) return;
          setContent(DOMPurify.sanitize(result.value));
          return;
        }

        if (previewKind === "text") {
          const sample = new Uint8Array(arrayBuffer.slice(0, 4096));
          const isBinary = sample.some((byte) => byte === 0);

          if (isBinary) {
            setError(
              "This file appears to be a binary format and cannot be displayed as text.",
            );
            return;
          }

          try {
            const text = new TextDecoder("utf-8", { fatal: true }).decode(arrayBuffer);
            if (
              normalizedMimeType === "application/json" ||
              getFileExtension(fileName) === "json"
            ) {
              try {
                setContent(JSON.stringify(JSON.parse(text), null, 2));
              } catch {
                setContent(text);
              }
            } else {
              setContent(text);
            }
          } catch {
            setContent(new TextDecoder("utf-8").decode(arrayBuffer));
          }
        }
      } catch (err) {
        console.error("Failed to load file preview:", err);
        if (isMounted) {
          setError(
            "Could not load file preview. The file might be corrupted or in an unsupported format.",
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadPreview();

    return () => {
      isMounted = false;
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current);
        pdfBlobUrlRef.current = null;
      }
    };
  }, [
    fileName,
    fileUrl,
    normalizedMimeType,
    previewKind,
    readFileBuffer,
    unsupportedLabel,
  ]);

  const rootStyle: React.CSSProperties = {
    height: "100%",
    position: "relative",
    overflow: "auto",
    isolation: "isolate",
    backgroundColor:
      previewKind === "docx"
        ? mergedTheme.docxWorkspaceBackground
        : mergedTheme.panelBackground,
    ...style,
  };

  const centeredStyle: React.CSSProperties = {
    display: "flex",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: "12px",
    padding: "24px",
    boxSizing: "border-box",
    color: mergedTheme.mutedTextColor,
    textAlign: "center",
  };

  return (
    <>
      <div className={className} style={rootStyle}>
        {loading ? (
          <div style={centeredStyle}>{loadingLabel}</div>
        ) : error ? (
          <div
            style={{
              ...centeredStyle,
              color: mergedTheme.errorColor,
            }}
          >
            {error}
          </div>
        ) : !fileUrl ? (
          <div style={centeredStyle}>{unsupportedLabel}</div>
        ) : previewKind === "image" ? (
          <div style={centeredStyle}>
            <img
              src={safeFileUrl}
              alt={fileName}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                ...mediaStyle,
              }}
            />
          </div>
        ) : previewKind === "video" ? (
          <div style={centeredStyle}>
            <video
              controls
              src={safeFileUrl}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                ...mediaStyle,
              }}
            />
          </div>
        ) : previewKind === "audio" ? (
          <div style={centeredStyle}>
            <FileText size={48} color={mergedTheme.mutedTextColor} />
            <div style={{ color: mergedTheme.textColor, wordBreak: "break-word" }}>
              {fileName}
            </div>
            <audio
              controls
              src={safeFileUrl}
              style={{
                width: "min(100%, 420px)",
                ...audioStyle,
              }}
            />
          </div>
        ) : previewKind === "pdf" && pdfBlobUrl ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              backgroundColor: mergedTheme.panelBackground,
            }}
            onContextMenu={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "20px",
                padding: "8px",
                backgroundColor: mergedTheme.toolbarBackground,
                borderBottom: `1px solid ${mergedTheme.borderColor}`,
                zIndex: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    color: mergedTheme.textColor,
                    fontSize: "12px",
                    opacity: 0.8,
                  }}
                >
                  {numPages || "..."} Pages
                </span>
              </div>

              <div
                style={{
                  width: "1px",
                  height: "20px",
                  backgroundColor: mergedTheme.borderColor,
                }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  onClick={() => setScale((prev) => Math.max(prev - 0.2, 0.5))}
                  style={{
                    background: "none",
                    border: "none",
                    color: mergedTheme.textColor,
                    cursor: "pointer",
                  }}
                  title="Zoom Out"
                >
                  <ZoomOut size={18} />
                </button>
                <span
                  style={{
                    color: mergedTheme.textColor,
                    fontSize: "13px",
                    minWidth: "40px",
                    textAlign: "center",
                  }}
                >
                  {Math.round(scale * 100)}%
                </span>
                <button
                  onClick={() => setScale((prev) => Math.min(prev + 0.2, 3))}
                  style={{
                    background: "none",
                    border: "none",
                    color: mergedTheme.textColor,
                    cursor: "pointer",
                  }}
                  title="Zoom In"
                >
                  <ZoomIn size={18} />
                </button>
                <button
                  onClick={() => setScale(1)}
                  style={{
                    background: "none",
                    border: "none",
                    color: mergedTheme.textColor,
                    cursor: "pointer",
                    marginLeft: "4px",
                  }}
                  title="Reset Zoom"
                >
                  <Maximize size={16} />
                </button>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflow: "auto",
                display: "flex",
                justifyContent: "center",
                padding: "20px",
                userSelect: "text",
              }}
            >
              <Document
                file={pdfBlobUrl}
                onLoadSuccess={({ numPages: totalPages }: { numPages: number }) => {
                  setNumPages(totalPages);
                }}
                loading={
                  <div style={{ color: mergedTheme.textColor, marginTop: "40px" }}>
                    Loading PDF...
                  </div>
                }
                error={
                  <div style={{ color: mergedTheme.errorColor, marginTop: "40px" }}>
                    Failed to load PDF.
                  </div>
                }
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  {Array.from(new Array(numPages), (_, index) => (
                    <div
                      key={`page_${index + 1}`}
                      style={{
                        marginBottom: "20px",
                        boxShadow: mergedTheme.pageShadow,
                      }}
                    >
                      <Page
                        pageNumber={index + 1}
                        scale={scale}
                        loading=""
                        renderAnnotationLayer={true}
                        renderTextLayer={true}
                      />
                    </div>
                  ))}
                </div>
              </Document>
            </div>
          </div>
        ) : previewKind === "text" ? (
          <pre
            style={{
              margin: 0,
              padding: "24px",
              color: mergedTheme.textColor,
              fontFamily: "monospace",
              fontSize: "14px",
              whiteSpace: "pre-wrap",
              wordWrap: "break-word",
              height: "100%",
              overflowY: "auto",
              boxSizing: "border-box",
              lineHeight: "1.5",
            }}
          >
            {content}
          </pre>
        ) : previewKind === "docx" ? (
          <div
            ref={contentRef}
            style={{
              padding: "40px 60px",
              maxWidth: "860px",
              margin: "0 auto",
              backgroundColor: mergedTheme.docxPaperBackground,
              minHeight: "100%",
              boxSizing: "border-box",
              boxShadow: mergedTheme.pageShadow,
            }}
          >
            <style>{`
              .docx-viewer-inner { all: revert; user-select: text !important; -webkit-user-select: text !important; cursor: text; pointer-events: auto !important; position: relative; z-index: 10; }
              .docx-viewer-inner * { all: revert; box-sizing: border-box; user-select: text !important; -webkit-user-select: text !important; pointer-events: auto !important; }
              .docx-viewer-inner p { margin: 0 0 0.6em 0; font-family: 'Calibri', 'Georgia', serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
              .docx-viewer-inner h1 { font-size: 2em; font-weight: bold; margin: 0.8em 0 0.4em; }
              .docx-viewer-inner h2 { font-size: 1.6em; font-weight: bold; margin: 0.7em 0 0.3em; }
              .docx-viewer-inner h3 { font-size: 1.3em; font-weight: bold; margin: 0.6em 0 0.3em; }
              .docx-viewer-inner h4, .docx-viewer-inner h5, .docx-viewer-inner h6 { font-size: 1.1em; font-weight: bold; margin: 0.5em 0 0.2em; }
              .docx-viewer-inner strong, .docx-viewer-inner b { font-weight: bold; }
              .docx-viewer-inner em, .docx-viewer-inner i { font-style: italic; }
              .docx-viewer-inner u { text-decoration: underline; }
              .docx-viewer-inner ul { margin: 0.4em 0 0.4em 2em; padding: 0; list-style-type: disc; }
              .docx-viewer-inner ol { margin: 0.4em 0 0.4em 2em; padding: 0; list-style-type: decimal; }
              .docx-viewer-inner li { margin-bottom: 0.2em; }
              .docx-viewer-inner table { width: 100%; border-collapse: collapse; margin: 1em 0; }
              .docx-viewer-inner td, .docx-viewer-inner th { border: 1px solid #ccc; padding: 6px 10px; vertical-align: top; }
              .docx-viewer-inner th { background: #f0f0f0; font-weight: bold; }
              .docx-viewer-inner [style*="text-align:center"], .docx-viewer-inner [align="center"] { text-align: center !important; }
              .docx-viewer-inner [style*="text-align:right"], .docx-viewer-inner [align="right"] { text-align: right !important; }
              .docx-viewer-inner [style*="text-align:justify"] { text-align: justify !important; }
              .docx-viewer-inner a { color: #2563eb; cursor: pointer; }
              .docx-viewer-inner img { max-width: 100%; height: auto; }
              .docx-viewer-inner hr { border: none; border-top: 1px solid #ddd; margin: 1em 0; }
            `}</style>
            <div
              className="docx-viewer-inner"
              dangerouslySetInnerHTML={{ __html: content || "" }}
            />
          </div>
        ) : (
          <div style={centeredStyle}>
            <FileText size={48} color={mergedTheme.mutedTextColor} />
            <span>{unsupportedLabel}</span>
          </div>
        )}
      </div>

      {pendingUrl && (
        <UnsafeLinkModal
          url={pendingUrl}
          onCancel={() => setPendingUrl(null)}
          onConfirm={async () => {
            await openExternalUrl(pendingUrl);
            setPendingUrl(null);
          }}
        />
      )}
    </>
  );
};

function useDocLinkInterceptor(
  ref: React.RefObject<HTMLDivElement | null>,
  handler: (e: MouseEvent) => void,
  deps: unknown[],
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, handler, ...deps]);
}
