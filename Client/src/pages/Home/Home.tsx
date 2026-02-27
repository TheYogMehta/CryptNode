import React, { useState, useEffect, useCallback, useRef } from "react";
import { App } from "@capacitor/app";
import { useChatLogic } from "./hooks/useChatLogic";
import { Sidebar } from "./components/sidebar/Sidebar";
import { ChatWindow } from "./components/chat/ChatWindowContainer";
import { ConnectionSetup } from "./components/overlays/ConnectionSetup";
import { RequestModal } from "./components/overlays/RequestModal";
import { CallOverlay } from "./components/overlays/CallOverlay";
import { WelcomeView } from "./components/views/WelcomeView";
import toast, { Toaster } from "react-hot-toast";
import { SettingsOverlay } from "./components/overlays/SettingsOverlay";
import { ProfileSetup } from "./components/overlays/ProfileSetup";
import { AppLockScreen } from "./components/overlays/AppLockScreen";
import LoadingScreen from "../LoadingScreen";
import { AccountService } from "../../services/auth/AccountService";
import ChatClient from "../../services/core/ChatClient";
import { RenameModal } from "./components/overlays/RenameModal";
import { DevicePendingModal } from "./components/overlays/DevicePendingModal";
import { DeviceApprovalModal } from "./components/overlays/DeviceApprovalModal";
import { SecureChatWindow } from "../../pages/SecureChat/SecureChatWindow";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { Capacitor } from "@capacitor/core";
import {
  AppContainer,
  MainContent,
  MobileHeader,
  HeaderTitle,
  MenuButton,
  ErrorToast,
} from "./Home.styles";
import { Menu } from "lucide-react";
import { useGlobalSummary } from "./hooks/useGlobalSummary";
import { qwenLocalService } from "../../services/ai/qwenLocal.service";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: "red" }}>
          <h2>Something went wrong.</h2>
          <pre>{this.state.error?.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const Home = () => {
  const [isLocked, setIsLocked] = useState(true);
  const { state, actions } = useChatLogic(!isLocked);

  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(true);
  const [storedAccounts, setStoredAccounts] = useState<any[]>([]);
  const [renameTarget, setRenameTarget] = useState<{
    sid: string;
    name: string;
  } | null>(null);
  const {
    isSummarizing,
    globalSummary,
    showSummaryModal,
    generateGlobalSummary,
    closeSummary,
  } = useGlobalSummary(state.sessions);

  const hasElectronGoogleLogin =
    typeof window !== "undefined" &&
    typeof window.SafeStorage?.googleLogin === "function";

  const [socialLoginInitialized, setSocialLoginInitialized] = useState(false);

  useEffect(() => {
    const initSocialLogin = async () => {
      if (socialLoginInitialized) return;
      if (hasElectronGoogleLogin) {
        try {
          localStorage.removeItem("OAUTH_STATE_KEY");
          localStorage.removeItem("oauth_state");
        } catch (_e) {}
        setSocialLoginInitialized(true);
        return;
      }
      await SocialLogin.initialize({
        google: {
          webClientId:
            "588653192623-aqs0s01hv62pbp5p7pe3r0h7mce8m10l.apps.googleusercontent.com",
          mode: "online",
        },
      });
      setSocialLoginInitialized(true);
    };
    initSocialLogin().catch(console.error);
  }, [hasElectronGoogleLogin, socialLoginInitialized]);

  const extractMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message || "Unknown error";
    if (typeof error === "string") return error;
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error";
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      if (hasElectronGoogleLogin) {
        const result = await window.SafeStorage.googleLogin();
        if (result && result.idToken) {
          await actions.login(result.idToken);
          setIsLocked(false);
        } else {
          toast.error("Google sign-in was cancelled.");
        }
      } else {
        const isAndroid = Capacitor.getPlatform() === "android";
        let response;
        try {
          response = await SocialLogin.login({
            provider: "google",
            options: {
              forceRefreshToken: !isAndroid,
              ...(isAndroid ? { style: "bottom" } : {}),
            },
          });
        } catch (error) {
          const msg = extractMessage(error);
          if (msg.includes("No credentials available")) {
            response = await SocialLogin.login({
              provider: "google",
              options: {
                forceRefreshToken: false,
                filterByAuthorizedAccounts: false,
                style: "standard",
              },
            });
          } else {
            throw error;
          }
        }

        if (
          response.result &&
          "idToken" in response.result &&
          response.result.idToken
        ) {
          await actions.login(response.result.idToken);
          setIsLocked(false);
        } else {
          toast.error("Failed to get Google ID token. Try again.");
        }
      }
    } catch (error) {
      console.error("Sign-In Error:", error);
      const msg = extractMessage(error);
      if (msg.includes("No credentials available")) {
        toast.error(
          "No Google account found. Please add an account in Android Settings.",
        );
      } else if (msg.includes("canceled") || msg.includes("cancelled")) {
        toast.error("Sign-in cancelled.");
      } else {
        toast.error("Login failed. Please try again.");
      }
    }
  };

  useEffect(() => {
    checkInitialState();
  }, []);

  const contextRef = useRef({
    isSidebarOpen: state.isSidebarOpen,
    view: state.view,
    showSettings,
    renameTarget,
    isLocked,
    inboundReq: state.inboundReq,
    isWaiting: state.isWaiting,
    showProfileSetup,
  });

  useEffect(() => {
    contextRef.current = {
      isSidebarOpen: state.isSidebarOpen,
      view: state.view,
      showSettings,
      renameTarget,
      isLocked,
      inboundReq: state.inboundReq,
      isWaiting: state.isWaiting,
      showProfileSetup,
    };
  }, [
    state.isSidebarOpen,
    state.view,
    showSettings,
    renameTarget,
    isLocked,
    state.inboundReq,
    state.isWaiting,
    showProfileSetup,
  ]);

  useEffect(() => {
    let backButtonHandle: { remove: () => Promise<void> } | null = null;
    const setupBackListener = async () => {
      try {
        backButtonHandle = await App.addListener("backButton", () => {
          const ctx = contextRef.current;
          console.log("[Home] Back button pressed. State:", ctx);

          if (ctx.isLocked || ctx.showProfileSetup) {
            App.minimizeApp();
            return;
          }

          if (ctx.renameTarget) {
            setRenameTarget(null);
            return;
          }
          if (ctx.showSettings) {
            setShowSettings(false);
            return;
          }
          if (ctx.inboundReq || ctx.isWaiting) {
            actions.setIsWaiting(false);
            actions.setInboundReq(null);
            return;
          }

          if (ctx.isSidebarOpen) {
            actions.setIsSidebarOpen(false);
            return;
          }

          if (ctx.view === "chat" || ctx.view === "add") {
            actions.setView("welcome");
            actions.setActiveChat(null);
            return;
          }

          App.minimizeApp();
        });
      } catch (e) {
        console.error("Error adding back button listener:", e);
      }
    };

    setupBackListener();

    return () => {
      if (backButtonHandle) {
        backButtonHandle.remove().catch((e) => {
          console.warn("Failed to remove back button listener", e);
        });
      }
    };
  }, []);
  const checkInitialState = async () => {
    try {
      const accs = await AccountService.getAccounts();
      console.log("[Home] Loaded accounts from storage:", accs);
      setStoredAccounts(accs);

      // Always show Lock Screen first, even if no accounts
      setIsLocked(true);
    } catch (e) {
      console.error("[Home] Failed to load initial state:", e);
      setIsLocked(true);
    }
  };

  const handleUnlock = useCallback(
    async (email: string) => {
      try {
        await ChatClient.switchAccount(email);
        setIsLocked(false);
      } catch (e) {
        console.error("Unlock failed", e);
        const msg = e instanceof Error ? e.message : String(e || "");
        if (
          msg.includes("Session expired") ||
          msg.includes("Authentication failed")
        ) {
          setIsLocked(true);
        }
      }
    },
    [],
  );

  useEffect(() => {
    console.log("[Home] Render state:", {
      userEmail: state.userEmail,
      view: state.view,
    });
  }, [state.userEmail, state.view]);

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isRightSwipe && isMobile && !state.isSidebarOpen) {
      if (touchStart < 50) {
        actions.setIsSidebarOpen(true);
      }
    }
    if (isLeftSwipe && isMobile && state.isSidebarOpen) {
      actions.setIsSidebarOpen(false);
    }
  }, [touchStart, touchEnd, isMobile, state.isSidebarOpen, actions]);

  const onSelectChat = useCallback(
    (sid: string) => {
      actions.setActiveChat(sid);
      actions.setView("chat");
      actions.setIsSidebarOpen(false);
    },
    [actions],
  );

  const onAddPeer = useCallback(() => {
    actions.setView("add");
    actions.setActiveChat(null);
    actions.setIsSidebarOpen(false);
  }, [actions]);

  const onCloseSidebar = useCallback(() => {
    actions.setIsSidebarOpen(false);
  }, [actions]);

  const onLogoClick = useCallback(() => {
    actions.setView("welcome");
    actions.setActiveChat(null);
  }, [actions]);

  const onOpenSettings = useCallback(() => {
    setShowSettings(true);
    actions.setIsSidebarOpen(false);
  }, [actions]);

  const onRename = useCallback((sid: string, currentName: string) => {
    setRenameTarget({ sid, name: currentName });
  }, []);

  const onOpenVault = useCallback(() => {
    actions.setActiveChat("secure-vault");
    actions.setView("chat");
    actions.setIsSidebarOpen(false);
  }, [actions]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (state.isLoading) {
    return <LoadingScreen message="Checking authentication..." />;
  }

  if (state.pendingMasterKey !== null) {
    return (
      <DevicePendingModal
        masterPubKey={state.pendingMasterKey}
        onLogout={async () => {
          await ChatClient.logout();
        }}
      />
    );
  }

  if (isLocked) {
    return (
      <AppLockScreen
        mode="lock_screen"
        accounts={storedAccounts}
        onUnlockAccount={handleUnlock}
        onAddAccount={handleGoogleSignIn}
        onSuccess={() => {}}
      />
    );
  }

  return (
    <ErrorBoundary>
      {showSummaryModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.8)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              backgroundColor: "#1E1E2E",
              padding: "24px",
              borderRadius: "16px",
              width: "90%",
              maxWidth: "500px",
              border: "1px solid #3B3B4F",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "16px",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <span style={{ fontSize: "1.5rem" }}>✨</span> Daily Digest
              </h2>
              <button
                onClick={closeSummary}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ccc",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            {isSummarizing ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 0",
                  color: "#ccc",
                }}
              >
                <div className="spinner" style={{ marginBottom: "10px" }}>
                  Generating...
                </div>
                <p>Analyzing your chats...</p>
              </div>
            ) : (
              <div
                style={{
                  maxHeight: "60vh",
                  overflowY: "auto",
                  color: "#ddd",
                  lineHeight: "1.6",
                  whiteSpace: "pre-wrap",
                }}
              >
                {globalSummary || "No updates found."}
              </div>
            )}
          </div>
        </div>
      )}

      <AppContainer
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {state.error && <ErrorToast>{state.error}</ErrorToast>}
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />

        <Sidebar
          sessions={state.sessions}
          activeChat={state.activeChat}
          isOpen={state.isSidebarOpen}
          isMobile={isMobile}
          onSelect={onSelectChat}
          onAddPeer={onAddPeer}
          onClose={onCloseSidebar}
          onLogoClick={onLogoClick}
          onSettings={onOpenSettings}
          onRename={onRename}
          onOpenVault={onOpenVault}
          onGlobalSummary={generateGlobalSummary}
        />

        <MainContent>
          {isMobile && state.view !== "chat" && (
            <MobileHeader>
              <MenuButton onClick={() => actions.setIsSidebarOpen(true)}>
                <Menu size={24} />
              </MenuButton>
              <div style={{ flex: 1 }}>
                <HeaderTitle onClick={() => actions.setView("welcome")}>
                  CryptNode
                </HeaderTitle>
              </div>
            </MobileHeader>
          )}

          {state.view === "chat" && state.activeChat === "secure-vault" ? (
            <SecureChatWindow
              onBack={() => {
                actions.setActiveChat(null);
                actions.setView("welcome");
                if (isMobile) {
                  actions.setIsSidebarOpen(true);
                }
              }}
            />
          ) : state.view === "chat" && state.activeChat ? (
            <ChatWindow
              messages={state.messages}
              onSend={actions.handleSend}
              activeChat={state.activeChat}
              session={state.sessions.find((s) => s.sid === state.activeChat)}
              onFileSelect={actions.handleFile}
              peerOnline={state.peerOnline}
              onStartCall={(mode: any) => actions.startCall(mode)}
              onBack={
                isMobile ? () => actions.setIsSidebarOpen(true) : undefined
              }
              replyingTo={state.replyingTo}
              setReplyingTo={actions.setReplyingTo}
              onLoadMore={actions.loadMoreHistory}
              isRateLimited={state.isRateLimited}
            />
          ) : state.view === "add" ? (
            <ConnectionSetup
              targetEmail={state.targetEmail}
              setTargetEmail={actions.setTargetEmail}
              onConnect={actions.handleConnect}
              isJoining={state.isJoining}
            />
          ) : (
            <WelcomeView onAddFriend={() => actions.setView("add")} />
          )}
        </MainContent>

        <CallOverlay
          callState={state.activeCall}
          localStream={state.localStream}
          onAccept={actions.acceptCall}
          onReject={actions.rejectCall}
          onHangup={actions.endCall}
        />

        {/* Removed RequestModal for pending requests to avoid popups */}

        {showSettings && (
          <SettingsOverlay
            onClose={() => setShowSettings(false)}
            currentUserEmail={state.userEmail}
            isMobile={isMobile}
            onAddAccount={handleGoogleSignIn}
          />
        )}

        {renameTarget && (
          <RenameModal
            currentName={renameTarget.name}
            onRename={(newName) => {
              actions.handleSetAlias(renameTarget.sid, newName);
              setRenameTarget(null);
            }}
            onCancel={() => setRenameTarget(null)}
          />
        )}

        {showProfileSetup && state.userEmail && (
          <ProfileSetup
            userEmail={state.userEmail}
            onComplete={() => setShowProfileSetup(false)}
          />
        )}

        {state.linkRequests && state.linkRequests.length > 0 && (
          <DeviceApprovalModal
            requests={state.linkRequests}
            onHandled={(pubKey) => {
              actions.setLinkRequests((prev: any[]) =>
                prev.filter((r) => r.senderPubKey !== pubKey),
              );
            }}
          />
        )}

        {isLocked && <AppLockScreen onSuccess={() => setIsLocked(false)} />}
      </AppContainer>
    </ErrorBoundary>
  );
};

export default Home;
