import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cryptnode",
  appName: "cryptnode",
  webDir: "dist",
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: "Biometric login for cryptnode",
        biometricSubTitle: "Log in using your biometric",
      },
      electronIsEncryption: true,
      electronWindowsLocation: "C:\\ProgramData\\cryptnode",
      electronLinuxLocation: "Databases",
    },
    PrivacyScreen: {
      enable: true,
      imageName: "Splashscreen",
      contentMode: "scaleAspectFit",
      preventScreenshots: true,
    },
    SocialLogin: {
      google: true,
      facebook: false,
      apple: false,
      twitter: false,
    },
    Keyboard: {
      resize: "body",
      style: "dark",
      resizeOnFullScreen: true,
    },
  },
  server: {
    androidScheme: "http",
  },
};

export default config;
