# Project Folder Structure

This document describes the complete organization of the project, explaining the purpose of each directory and file.

## Repository Structure

    ```
    chatapp/
    ├── .git/                      # Git version control
    ├── .vscode/                   # VSCode workspace settings
    │   └── extensions.json        # Recommended extensions
    ├── Client/                    # Frontend application (React + Capacitor)
    ├── Server/                    # Backend relay server (Go)
    ├── Notes/                     # Development notes and resources
    ├── docs/                      # Documentation (this folder)
    ├── .gitignore                 # Git ignore rules (root level)
    └── readme.md                  # Main project README
    ```

## Client Directory (`/Client`)

    ```
    Client/
    ├── .browserslistrc            # Browser compatibility targets
    ├── .gitignore                 # Client-specific git ignores
    ├── android/                   # Android platform (Capacitor)
    │   ├── app/
    │   │   ├── build.gradle       # Android build configuration
    │   │   ├── google-services.json  # Firebase/Google services (KEEP SECRET!)
    │   │   ├── proguard-rules.pro # Code obfuscation rules
    │   │   └── src/               # Android native code
    │   ├── gradle/                # Gradle wrapper
    │   ├── build.gradle           # Project-level Gradle config
    │   └── settings.gradle        # Gradle settings
    ├── assets/                    # Static assets (images, fonts)
    ├── capacitor.config.ts        # Capacitor configuration
    ├── cypress/                   # End-to-end tests
    │   ├── e2e/                   # Test specs
    │   ├── fixtures/              # Test data
    │   └── support/               # Test helpers
    ├── cypress.config.ts          # Cypress configuration
    ├── dist/                      # Build output (generated, not in git)
    ├── electron/                  # Electron platform
    │   ├── dist/                  # Electron build output
    │   ├── preload.js             # Electron preload script
    │   ├── main.js                # Electron main process
    │   └── package.json           # Electron dependencies
    ├── eslint.config.js           # ESLint linting rules
    ├── icons/                     # App icons (various sizes)
    ├── index.html                 # HTML entry point
    ├── ionic.config.json          # Ionic CLI configuration
    ├── node_modules/              # NPM dependencies (generated)
    ├── package.json               # NPM package manifest
    ├── package-lock.json          # NPM dependency lock file
    ├── public/                    # Static public assets
    ├── favicon.ico            # Browser favicon
    └── manifest.json          # PWA manifest
    ├── readme.md                  # Client README
    ├── src/                       # Source code (React app)
    ├── sync.cjs                   # Capacitor sync script
    ├── tsconfig.json              # TypeScript configuration
    ├── tsconfig.node.json         # TypeScript config for Node scripts
    └── vite.config.ts             # Vite bundler configuration
    ```

### Client Source Code (`/Client/src`)

    ```
    src/
    ├── App.css # Global styles
    ├── App.tsx # Root React component
    ├── components/ # React components
    │ ├── AppLock.tsx # PIN/biometric lock screen
    │ ├── CallOverlay.tsx # Voice call UI overlay
    │ ├── ChatInput.tsx # Message input field
    │ ├── ChatMessage.tsx # Individual message bubble
    │ ├── ChatWindow.tsx # Main chat display area
    │ ├── ConnectionSetup.tsx # Peer connection form
    │ ├── FilePreview.tsx # File attachment preview
    │ ├── MessageInput.tsx # Message composer
    │ ├── MessageList.tsx # Scrollable message list
    │ ├── SettingsOverlay.tsx # Settings modal
    │ ├── Sidebar.tsx # Session list sidebar
    │ ├── UserAvatar.tsx # User avatar component
    │ └── ... # Other UI components
    ├── hooks/ # Custom React hooks
    │ ├── useChatLogic.ts # Main chat logic hook
    │ ├── useSecureChat.ts # Secure vault hook
    │ └── ... # Other hooks
    ├── pages/ # Page components
    │ └── Home.tsx # Main application page
    ├── services/ # Business logic services
    │ ├── AccountService.ts # Account/identity management
    │ ├── ChatClient.ts # WebSocket client + encryption
    │ ├── SafeStorage.ts # Secure key storage interface
    │ └── sqliteService.ts # SQLite database wrapper
    ├── theme/ # CSS theme variables
    │ └── variables.css # Color schemes, spacing
    ├── utils/ # Utility functions
    │ ├── crypto.ts # Encryption/decryption helpers
    │ ├── formatting.ts # Date/time formatting
    │ └── ... # Other utilities
    ├── main.tsx # React entry point
    └── vite-env.d.ts # Vite type definitions
    ```

## Server Directory (`/Server`)

    ```
    Server/
    ├── socket.go # Main WebSocket server
    ├── go.mod # Go module definition
    ├── go.sum # Go dependency checksums
    ├── server.log # Server logs (generated)
    └── README.md # Server README
    ```

## Documentation (`/docs`)

    ```

    docs/
    ├── OVERVIEW.md # Application overview
    ├── ARCHITECTURE.md # System architecture
    ├── USER_FLOWS.md # User journey flows
    ├── AUTHENTICATION.md # Auth system details
    ├── FEATURES.md # Feature-by-feature breakdown
    ├── WEBSOCKET_PROTOCOL.md # Protocol specification
    ├── DATABASE.md # Database schema
    ├── SECURITY.md # Security protocols
    ├── DEPLOYMENT.md # Deployment guide
    ├── FOLDER_STRUCTURE.md # This file
    ├── GLOSSARY.md # Terms and definitions
    └── SETUP.md # Build & run instructions

    ```

## Key File Purposes

### Configuration Files

| File                  | Purpose                                                 |
| --------------------- | ------------------------------------------------------- |
| `capacitor.config.ts` | Configures Capacitor platforms (Android, Electron, iOS) |
| `vite.config.ts`      | Vite bundler settings, plugins, aliases                 |
| `tsconfig.json`       | TypeScript compiler options                             |
| `ionic.config.json`   | Ionic CLI integration                                   |
| `eslint.config.js`    | Code linting rules                                      |
| `cypress.config.ts`   | E2E test configuration                                  |

### Special Files

| File                   | Purpose                                  | Keep Secret? |
| ---------------------- | ---------------------------------------- | ------------ |
| `google-services.json` | Google OAuth/Firebase config for Android | No           |
| `package-lock.json`    | Locks NPM dependency versions            | No           |
| `go.sum`               | Locks Go dependency versions             | No           |

## Module Organization

### Service Layer (`/Client/src/services`)

Singleton services that manage core application state:

- **ChatClient.ts**: Central hub for WebSocket, encryption, and messaging
- **AccountService.ts**: User account lifecycle (login, switch, logout)
- **SafeStorage.ts**: Platform-agnostic secure storage wrapper
- **sqliteService.ts**: Database operations and schema management

**Design Pattern**: Services exist outside React component tree, communicate via events.

### Component Layer (`/Client/src/components`)

React components organized by functionality:

- **Layout**: `Sidebar.tsx`, `ChatWindow.tsx`
- **Messaging**: `ChatMessage.tsx`, `MessageList.tsx`, `MessageInput.tsx`
- **Modals/Overlays**: `CallOverlay.tsx`, `SettingsOverlay.tsx`, `ConnectionSetup.tsx`
- **Atoms**: `UserAvatar.tsx`, `FilePreview.tsx`

**Design Pattern**: Presentational components receive data via props, emit events via callbacks.

### Hook Layer (`/Client/src/hooks`)

Custom hooks bridge services and components:

- **useChatLogic.ts**: Subscribes to ChatClient events, provides message state to UI
- **useSecureChat.ts**: Manages vault state and passphrase

**Design Pattern**: Hooks encapsulate side effects (subscriptions, local state).
