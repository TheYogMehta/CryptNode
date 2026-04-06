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
import { ConnectionBanner } from "./components/overlays/ConnectionBanner";
import { AccountService } from "../../services/auth/AccountService";
import ChatClient from "../../services/core/ChatClient";
import { RenameModal } from "./components/overlays/RenameModal";
import { SidebarSkeleton } from "../../components/ui/Skeleton";
import {
  SidebarContainer,
  SidebarHeader,
  Logo,
  SessionList,
  SectionLabel,
} from "./components/sidebar/Sidebar.styles";

import { SecureChatWindow } from "../../pages/SecureChat/SecureChatWindow";
import { LocalLLMChatWindow } from "../../pages/LocalLLM/LocalLLMChatWindow";
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
  const [settingsTab, setSettingsTab] = useState<any>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(true);
  const [storedAccounts, setStoredAccounts] = useState<any[]>([]);
  const [renameTarget, setRenameTarget] = useState<{
    sid: string;
    name: string;
  } | null>(null);
  const {
    isSummarizing,
    isInitializingModel,
    summaryElapsedMs,
    globalSummary,
    showSummaryModal,
    generateGlobalSummary,
    closeSummary,
  } = useGlobalSummary(state.sessions);

  const hasElectronGoogleLogin =
    typeof window !== "undefined" &&
    typeof window.SafeStorage?.googleLogin === "function";

  const isAndroidPlatform = Capacitor.getPlatform() === "android";

  const [socialLoginInitialized, setSocialLoginInitialized] = useState(false);

  useEffect(() => {
    const initSocialLogin = async () => {
      if (socialLoginInitialized) return;
      if (hasElectronGoogleLogin) {
        try {
          localStorage.removeItem("OAUTH_STATE_KEY");
          localStorage.removeItem("oauth_state");
        } catch (_e) { }
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
          setShowSettings(false);
          setShowProfileSetup(true);
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
          setShowSettings(false);
          setShowProfileSetup(true);
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
    const handleAuthError = (data?: { isManualLogout?: boolean }) => {
      checkInitialState();
      if (data?.isManualLogout) {
        setIsLocked(true);
        return;
      }
      console.log("[Home] auth_error event received. Forcing AppLock and triggering login if not locked.");
      setIsLocked(true);
      if (!isLocked) {
        toast.error("Session expired. Please sign in again.");
        setTimeout(() => {
          handleGoogleSignIn();
        }, 500);
      }
    };

    ChatClient.on("auth_error", handleAuthError);
    return () => {
      ChatClient.off("auth_error", handleAuthError);
    };
  }, [isLocked]);

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

  const handleUnlock = async (email: string) => {
    try {
      console.log("[Home] handleUnlock called for:", email);
      const { pubKey, token } = await ChatClient.switchAccountLocal(email);

      ChatClient.switchAccountConnect(email, pubKey, token).catch(() => {});

      setIsLocked(false);
    } catch (e) {
      console.error("Unlock failed", e);
      const msg = e instanceof Error ? e.message : String(e || "");
      if (msg.includes("Session expired")) {
        toast.error("Session expired. Opening login...");
        handleGoogleSignIn();
      } else if (
        msg.includes("Authentication failed") ||
        msg.includes("WebSocket timeout")
      ) {
        setIsLocked(true);
      }
    }
  };

  useEffect(() => {
    console.log("[Home] Render state:", {
      userEmail: state.userEmail,
      view: state.view,
    });
  }, [state.userEmail, state.view]);

  const minSwipeDistance = 50;
  const swipeEdgeActivationWidth = 72;
  const touchGestureRef = useRef<{
    startX: number | null;
    startY: number | null;
    currentX: number | null;
    currentY: number | null;
  }>({
    startX: null,
    startY: null,
    currentX: null,
    currentY: null,
  });

  const resetTouchGesture = useCallback(() => {
    touchGestureRef.current = {
      startX: null,
      startY: null,
      currentX: null,
      currentY: null,
    };
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchGestureRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
    };
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchGestureRef.current.currentX = touch.clientX;
    touchGestureRef.current.currentY = touch.clientY;
  }, []);

  const onTouchCancel = useCallback(() => {
    resetTouchGesture();
  }, [resetTouchGesture]);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const { startX, startY, currentX, currentY } = touchGestureRef.current;

      if (startX === null || startY === null) {
        resetTouchGesture();
        return;
      }

      const endTouch = e.changedTouches[0];
      const endX = endTouch?.clientX ?? currentX;
      const endY = endTouch?.clientY ?? currentY;

      if (endX === null || endY === null) {
        resetTouchGesture();
        return;
      }

      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const isHorizontalSwipe =
        Math.abs(deltaX) >= minSwipeDistance &&
        Math.abs(deltaX) > Math.abs(deltaY);
      const startedNearLeftEdge = startX <= swipeEdgeActivationWidth;

      if (isHorizontalSwipe && isMobile) {
        if (deltaX > 0 && !state.isSidebarOpen && startedNearLeftEdge) {
          actions.setIsSidebarOpen(true);
        }

        if (deltaX < 0 && state.isSidebarOpen) {
          actions.setIsSidebarOpen(false);
        }
      }

      resetTouchGesture();
    },
    [
      actions,
      isMobile,
      minSwipeDistance,
      resetTouchGesture,
      state.isSidebarOpen,
      swipeEdgeActivationWidth,
    ],
  );

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
    return (
      <AppContainer>
        <SidebarContainer isOpen={true} isMobile={isMobile}>
          <SidebarHeader>
            <Logo>
              Crypt<span>Node</span>
            </Logo>
          </SidebarHeader>
          <SessionList>
            <SectionLabel>SECURE SESSIONS</SectionLabel>
            <SidebarSkeleton />
          </SessionList>
        </SidebarContainer>
        <MainContent />
      </AppContainer>
    );
  }

  if (isLocked) {
    return (
      <AppLockScreen
        mode="lock_screen"
        accounts={storedAccounts}
        userEmail={ChatClient.userEmail}
        onUnlockAccount={handleUnlock}
        onAddAccount={handleGoogleSignIn}
        onSuccess={() => { }}
      />
    );
  }

  return (
    <ErrorBoundary>
      {showSummaryModal && !isAndroidPlatform && (
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

            {isInitializingModel ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 0",
                  color: "#ccc",
                }}
              >
                <div style={{ fontSize: "1.5rem", marginBottom: "10px" }}>⚙️</div>
                <p>Initialising model...</p>
              </div>
            ) : isSummarizing ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 0",
                  color: "#ccc",
                }}
              >
                <div className="spinner" style={{ marginBottom: "10px" }}>
                  ✨
                </div>
                <p>Generating...</p>
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
                {summaryElapsedMs !== null && globalSummary && (
                  <div
                    style={{
                      marginTop: "12px",
                      fontSize: "11px",
                      color: "rgba(255,255,255,0.3)",
                      textAlign: "right",
                    }}
                  >
                    Generated in {(summaryElapsedMs / 1000).toFixed(1)}s
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <AppContainer
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        <ConnectionBanner />
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
          onDelete={actions.handleDeleteChat}
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
          ) : state.view === "chat" && state.activeChat === "local-llm" ? (
            <LocalLLMChatWindow
              onBack={() => {
                actions.setActiveChat(null);
                actions.setView("welcome");
                if (isMobile) {
                  actions.setIsSidebarOpen(true);
                }
              }}
              onOpenSettings={() => {
                setSettingsTab("Local AI");
                setShowSettings(true);
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
              isLoadingHistory={state.isLoadingHistory}
              firstItemIndex={state.firstItemIndex}
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

          {state.activeCall && state.activeCall.status !== "idle" && (
            <CallOverlay
              key={state.activeCall.sid}
              callState={state.activeCall}
              localStream={state.localStream}
              onAccept={actions.acceptCall}
              onReject={actions.rejectCall}
              onHangup={actions.endCall}
            />
          )}
        </MainContent>



        {(state.inboundReq || state.isWaiting) && (
          <RequestModal
            inboundReq={state.inboundReq}
            isWaiting={state.isWaiting}
            setInboundReq={actions.setInboundReq}
            setIsWaiting={actions.setIsWaiting}
          />
        )}

        {showSettings && (
          <SettingsOverlay
            defaultTab={settingsTab}
            onClose={() => {
              setShowSettings(false);
              setSettingsTab(null);
            }}
            currentUserEmail={state.userEmail}
            isMobile={isMobile}
            onAddAccount={async () => {
              if (state.userEmail) {
                await ChatClient.logout();
                setShowSettings(false);
                setIsLocked(true);
              } else {
                handleGoogleSignIn();
              }
            }}
            onSwitchAccount={async (email) => {
              try {
                actions.setView("welcome");
                actions.setActiveChat(null);
                actions.setIsSidebarOpen(false);
                // Phase 1: Unlock local DB only. Do NOT connect to WebSocket yet.
                await ChatClient.switchAccountLocal(email);
                setShowSettings(false);
                // Require the user to unlock the newly switched account for security.
                // The WS reconnection will happen after they successfully enter the PIN in AppLockScreen.
                setIsLocked(true);
              } catch (e) {
                console.error("Account switch failed", e);
                // If it failed (e.g. timeout or expired session), we stay within the app
                setShowSettings(false);
                setIsLocked(true);
              }
            }}
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

        {isLocked && <AppLockScreen onSuccess={() => setIsLocked(false)} />}
      </AppContainer>
    </ErrorBoundary>
  );
};

export default Home;
