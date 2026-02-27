import React, { useEffect } from "react";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { Capacitor } from "@capacitor/core";
import ChatClient from "../services/core/ChatClient";
import {
  LoginContainer,
  HeaderSection,
  Title,
  Subtitle,
  LoginCard,
  LogoIcon,
  WelcomeTitle,
  WelcomeText,
  GoogleButton,
  LoadingSpinner,
  LoadingText,
} from "./Login.styles";
import { BackupService } from "../services/storage/BackupService";
import { colors } from "../theme/design-system";

interface LoginProps {
  onLogin: (token: string) => void;
}

let socialLoginInitialized = false;

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const hasElectronGoogleLogin =
    typeof window !== "undefined" &&
    typeof window.SafeStorage?.googleLogin === "function";

  useEffect(() => {
    const initSocialLogin = async () => {
      if (socialLoginInitialized) return;
      if (hasElectronGoogleLogin) {
        try {
          localStorage.removeItem("OAUTH_STATE_KEY");
          localStorage.removeItem("oauth_state");
        } catch (_e) {}
        socialLoginInitialized = true;
        return;
      }
      await SocialLogin.initialize({
        google: {
          webClientId:
            "588653192623-aqs0s01hv62pbp5p7pe3r0h7mce8m10l.apps.googleusercontent.com",
          mode: "online",
        },
      });
      socialLoginInitialized = true;
    };
    initSocialLogin().catch(console.error);
  }, [hasElectronGoogleLogin]);

  const [isLoading, setIsLoading] = React.useState(false);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const [showRestorePrompt, setShowRestorePrompt] = React.useState(false);
  const [restoreBuffer, setRestoreBuffer] = React.useState<ArrayBuffer | null>(
    null,
  );
  const [tempCode, setTempCode] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const isAndroid = Capacitor.getPlatform() === "android";
  const extractMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message || "Unknown error";
    if (typeof error === "string") return error;
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error";
    }
  };

  useEffect(() => {
    const onAuthDone = () => setIsLoading(false);
    const onRateLimited = () => {
      setIsLoading(false);
      setErrorText("Login rate limited. Please try again in a few seconds.");
    };

    ChatClient.on("auth_success", onAuthDone);
    ChatClient.on("auth_error", onAuthDone);
    ChatClient.on("rate_limit_exceeded", onRateLimited);

    return () => {
      ChatClient.off("auth_success", onAuthDone);
      ChatClient.off("auth_error", onAuthDone);
      ChatClient.off("rate_limit_exceeded", onRateLimited);
    };
  }, []);

  const signIn = async () => {
    if (isLoading) return;
    setErrorText(null);
    setIsLoading(true);
    try {
      if (hasElectronGoogleLogin) {
        const result = await window.SafeStorage.googleLogin();
        if (result && result.idToken) {
          await Promise.resolve(onLogin(result.idToken));
        } else {
          console.error("Electron Login Failed or Cancelled");
          setErrorText("Google sign-in was cancelled.");
          setIsLoading(false);
        }
      } else {
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
          await Promise.resolve(onLogin(response.result.idToken));
        } else {
          setErrorText("Failed to get Google ID token. Try again.");
          setIsLoading(false);
        }
      }
      setIsLoading(false);
    } catch (error) {
      console.error("Sign-In Error:", error);
      const msg = extractMessage(error);
      if (msg.includes("No credentials available")) {
        setErrorText(
          "No Google account found. Please add an account in Android Settings.",
        );
      } else if (msg.includes("canceled") || msg.includes("cancelled")) {
        setErrorText("Sign-in cancelled.");
      } else {
        setErrorText("Login failed. Please try again.");
      }
      setIsLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      setRestoreBuffer(arrayBuffer);
      setShowRestorePrompt(true);
    } catch (err) {
      setErrorText("Failed to read backup file.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRestoreSubmit = async () => {
    if (!restoreBuffer || !tempCode) return;
    setIsLoading(true);
    setShowRestorePrompt(false);
    try {
      await BackupService.restoreFromEncryptedBackup(restoreBuffer, tempCode);
      alert("Backup restored! Please sign in with Google to continue.");
      setTempCode("");
      setRestoreBuffer(null);
    } catch (err: any) {
      setErrorText(err.message || "Failed to restore backup.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LoginContainer>
      <HeaderSection>
        <Title>
          Crypt<span>Node</span>
        </Title>
        <Subtitle>Secure End-to-End Encrypted Chat</Subtitle>
      </HeaderSection>

      <LoginCard>
        <LogoIcon>C</LogoIcon>
        <WelcomeTitle>Welcome Back</WelcomeTitle>
        <WelcomeText>
          Sign in to verify your identity and start chatting securely with your
          peers.
        </WelcomeText>

        <GoogleButton
          onClick={signIn}
          disabled={isLoading}
          isLoading={isLoading}
        >
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span>Sign in with Google</span>
            </>
          )}
        </GoogleButton>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          style={{
            marginTop: "15px",
            background: "transparent",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            color: colors.text.secondary,
            padding: "10px 16px",
            borderRadius: "8px",
            fontSize: "14px",
            cursor: "pointer",
            width: "100%",
            transition: "all 0.2s",
          }}
          onMouseOver={(e) =>
            (e.currentTarget.style.color = colors.text.primary)
          }
          onMouseOut={(e) =>
            (e.currentTarget.style.color = colors.text.secondary)
          }
        >
          Restore from Backup
        </button>
        <input
          type="file"
          accept=".zip"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {isLoading && (
          <LoadingText>Setting up secure environment...</LoadingText>
        )}
        {errorText && (
          <LoadingText style={{ color: "#ff7f7f", marginTop: "8px" }}>
            {errorText}
          </LoadingText>
        )}
      </LoginCard>

      {showRestorePrompt && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.8)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: colors.background.secondary,
              padding: "24px",
              borderRadius: "12px",
              width: "90%",
              maxWidth: "400px",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", color: colors.text.primary }}>
              Enter Backup Code
            </h3>
            <p
              style={{
                color: colors.text.secondary,
                fontSize: "14px",
                marginBottom: "20px",
              }}
            >
              Please enter your 12-word Master Backup Phrase to decrypt this
              backup.
            </p>
            <input
              type="text"
              value={tempCode}
              onChange={(e) => setTempCode(e.target.value)}
              placeholder="e.g. apple banana orange..."
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.2)",
                color: colors.text.primary,
                marginBottom: "20px",
              }}
            />
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setShowRestorePrompt(false);
                  setRestoreBuffer(null);
                  setTempCode("");
                }}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  color: colors.text.secondary,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRestoreSubmit}
                style={{
                  padding: "8px 16px",
                  background: colors.primary.main,
                  color: "white",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Decrypt & Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </LoginContainer>
  );
};
