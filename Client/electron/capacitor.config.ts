import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.chatapp",
  appName: "chatapp",
  webDir: "dist",
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: "Biometric login for chatapp",
        biometricSubTitle: "Log in using your biometric",
      },
      electronIsEncryption: true,
      electronWindowsLocation: "C:\\ProgramData\\chatapp",
      electronLinuxLocation: "Databases",
    },
    PrivacyScreen: {
      enable: true,
      imageName: "Splashscreen",
      contentMode: "scaleAspectFit",
      preventScreenshots: true,
    },
    SocialLogin: {
      google: {
        webClientId: "588653192623-dldr83lei79ub9vqcbi45q7iofieqs1l.apps.googleusercontent.com",
        mode: "online"
      }
    },

  },
  server: {
    androidScheme: "http",
  },
};

export default config;
