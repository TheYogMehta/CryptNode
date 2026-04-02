import React, { useEffect, useState, useRef, useCallback } from "react";
import Modal from "@mui/material/Modal";
import { X, FileText, Download } from "lucide-react";
import * as mammoth from "mammoth";
import DOMPurify from "dompurify";
import { UnsafeLinkModal } from "./UnsafeLinkModal";
import { isTrustedUrl } from "../../../../utils/trustedDomains";
import { openExternalUrl } from "../../../../utils/openExternalUrl";

interface FileViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string | null;
  fileName: string;
  mimeType: string;
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({
  isOpen,
  onClose,
  fileUrl,
  fileName,
  mimeType,
}) => {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pdfBlobUrlRef = useRef<string | null>(null);

  const handleDocLinkClick = useCallback(
    (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || !href.startsWith("http")) return;
      e.preventDefault();
      e.stopPropagation();
      if (isTrustedUrl(href)) {
        openExternalUrl(href);
      } else {
        setPendingUrl(href);
      }
    },
    [],
  );

  const getExtension = () => {
    const parts = fileName?.split?.(".");
    return parts && parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
  };

  const isTextType = () => {
    return !isPdf() && !isDocx();
  };

  const isPdf = () => {
    return mimeType === "application/pdf" || getExtension() === "pdf";
  };

  const isDocx = () => {
    return (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      getExtension() === "docx" ||
      getExtension() === "doc"
    );
  };

  // We only support proper display for text, pdf, docx. Wait, does mammoth support .doc? Not really. But we can map .doc gracefully as format error inside mammoth.
  
  const isPreviewable = () => {
     return true;
  }

  useEffect(() => {
    if (!isOpen || !fileUrl) {
      setContent(null);
      setError(null);
      return;
    }

    const loadContent = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error("Failed to fetch file");

        if (isDocx()) {
          const arrayBuffer = await response.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          const cleanHtml = DOMPurify.sanitize(result.value);
          setContent(cleanHtml);
        } else if (isTextType()) {
          const arrayBuffer = await response.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer.slice(0, 4096));
          let isBinary = false;
          for (let i = 0; i < uint8.length; i++) {
            if (uint8[i] === 0) {
              isBinary = true;
              break;
            }
          }

          if (isBinary) {
            setError("This file appears to be a binary format and cannot be displayed as text.");
          } else {
            try {
              const text = new TextDecoder("utf-8", { fatal: true }).decode(arrayBuffer);
              setContent(text);
            } catch (e) {
              const text = new TextDecoder("utf-8").decode(arrayBuffer);
              setContent(text);
            }
          }
        }
      } catch (err) {
        console.error("Error loading file viewer:", err);
        setError("Could not load file preview. The file might be corrupted or in an unsupported format.");
      } finally {
        setLoading(false);
      }
    };

    let isMounted = true;

    if (isPdf()) {
      setLoading(true);
      setError(null);
      
      fetch(fileUrl)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch PDF");
          return res.arrayBuffer();
        })
        .then((buffer) => {
          if (!isMounted) return;
          const blob = new Blob([buffer], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          
          if (pdfBlobUrlRef.current) {
            URL.revokeObjectURL(pdfBlobUrlRef.current);
          }
          
          pdfBlobUrlRef.current = url;
          setPdfBlobUrl(url);
          setLoading(false);
        })
        .catch((err) => {
          if (!isMounted) return;
          console.error("Failed to process PDF file:", err);
          setError("Could not load PDF viewer. Please try downloading the file instead.");
          setLoading(false);
        });
    } else {
      loadContent();
    }

    return () => {
      isMounted = false;
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current);
        pdfBlobUrlRef.current = null;
      }
    };
  }, [isOpen, fileUrl, fileName, mimeType]);

  // Attach click handler to the docx container whenever content changes
  useDocLinkInterceptor(contentRef, handleDocLinkClick, [content]);

  if (!isOpen) return null;

  return (
    <>
      <Modal
        open={isOpen}
        onClose={onClose}
        aria-labelledby="file-viewer-modal"
        aria-describedby="file-viewer-modal-description"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        }}
      >
      <div
        style={{
          width: "90%",
          maxWidth: "1000px",
          height: "85vh",
          backgroundColor: "#1e1e2e",
          borderRadius: "12px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          overflow: "hidden",
          outline: "none",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            backgroundColor: "#1a1a2e",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "white" }}>
            <FileText size={20} color="#60a5fa" />
            <h2
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "60vw",
              }}
            >
              {fileName}
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <a
              href={fileUrl || "#"}
              download={fileName}
              style={{
                display: "flex",
                alignItems: "center",
                color: "rgba(255, 255, 255, 0.7)",
                background: "rgba(255, 255, 255, 0.05)",
                padding: "6px 12px",
                borderRadius: "6px",
                textDecoration: "none",
                fontSize: "14px",
                gap: "6px",
                transition: "all 0.2s",
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = "white"; e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"; }}
              onMouseOut={(e) => { e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)"; e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"; }}
            >
              <Download size={16} /> Save
            </a>
            <button
              onClick={onClose}
              style={{
                border: "none",
                background: "rgba(255, 255, 255, 0.05)",
                color: "rgba(255, 255, 255, 0.7)",
                cursor: "pointer",
                padding: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "6px",
                transition: "all 0.2s",
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = "white"; e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"; }}
              onMouseOut={(e) => { e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)"; e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"; }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, backgroundColor: isDocx() ? "#f8f9fa" : "#1e1e2e", position: "relative", overflow: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "rgba(255, 255, 255, 0.5)" }}>
              Loading Document Viewer...
            </div>
          ) : error ? (
            <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#f87171", padding: "20px", textAlign: "center" }}>
              {error}
            </div>
          ) : isPdf() && pdfBlobUrl ? (
            <iframe
              src={`${pdfBlobUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`}
              width="100%"
              height="100%"
              title="PDF Viewer"
              style={{
                border: "none",
                backgroundColor: "white",
                display: "block",
              }}
            />
          ) : isTextType() ? (
            <pre
              style={{
                margin: 0,
                padding: "24px",
                color: "#e2e8f0",
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
          ) : isDocx() ? (
            <div
              ref={contentRef}
              style={{
                padding: "40px 60px",
                maxWidth: "860px",
                margin: "0 auto",
                backgroundColor: "white",
                minHeight: "100%",
                boxSizing: "border-box",
                boxShadow: "0 0 20px rgba(0,0,0,0.08)",
              }}
            >
              <style>{`
                .docx-viewer-inner { all: revert; user-select: text !important; -webkit-user-select: text !important; cursor: text; }
                .docx-viewer-inner * { all: revert; box-sizing: border-box; user-select: text !important; -webkit-user-select: text !important; }
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
            <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "rgba(255, 255, 255, 0.5)", flexDirection: "column", gap: "12px" }}>
              <FileText size={48} opacity={0.5} />
              <span>Preview not available for this file type.</span>
            </div>
          )}
        </div>
      </div>
    </Modal>

    {pendingUrl && (
        <UnsafeLinkModal
          url={pendingUrl}
          onCancel={() => setPendingUrl(null)}
          onConfirm={async () => {
            await openExternalUrl(pendingUrl!);
            setPendingUrl(null);
          }}
        />
      )}
    </>
  );
};

// Attach link-click interceptor whenever content rerenders inside the docx container
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
