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
    │   │   ├── google-services.json # Firebase/Google services
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
    │   ├── favicon.ico            # Browser favicon
    │   └── manifest.json          # PWA manifest
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
    ├── App.tsx                    # Root React component & routing
    ├── main.tsx                   # React entry point
    ├── vite-env.d.ts              # Vite type definitions
    ├── assets/                    # Bundled assets (SVGs, images)
    ├── components/                # Shared React components
    │   ├── EmojiPicker.tsx        # Emoji selection popover
    │   ├── GifPicker.tsx          # Tenor GIF search & selection
    │   ├── UserAvatar.tsx         # User avatar with presence indicator
    │   └── ui/                    # Low-level UI primitives
    │       ├── Avatar.tsx         # Base avatar element
    │       ├── Button.tsx         # Button variants
    │       ├── Card.tsx           # Card layout container
    │       └── IconButton.tsx     # Icon-only button
    ├── hooks/                     # Shared custom React hooks
    │   └── useRecentEmojis.ts     # Persists recently used emojis
    ├── pages/                     # Page-level components
    │   ├── Home/                  # Main chat page
    │   │   ├── Home.tsx           # Root layout: sidebar + chat window
    │   │   ├── Home.styles.ts     # Styled-component definitions
    │   │   ├── types.ts           # Shared TypeScript interfaces (ChatMessage, etc.)
    │   │   ├── components/        # Home-specific sub-components
    │   │   └── hooks/             # Home-specific hooks (chat logic, calls, etc.)
    │   ├── SecureChat/            # Secure Vault page
    │   │   ├── SecureChatWindow.tsx  # Vault UI (passwords, files, notes)
    │   │   ├── SecureChatWindow.css  # Vault styles
    │   │   ├── SavePasswordModal.tsx # Password save dialog
    │   │   └── hooks/             # Vault-specific hooks
    │   ├── LoadingScreen.tsx      # Splash/loading screen
    │   └── Login.styles.ts        # Login page styles
    ├── services/                  # Business logic (organized by domain)
    │   ├── ai/
    │   │   └── qwenLocal.service.ts   # On-device Qwen LLM inference (WASM + Native)
    │   ├── auth/
    │   │   ├── AccountService.ts      # Account lifecycle (add, switch, remove)
    │   │   └── AuthService.ts         # Google OAuth token management
    │   ├── core/
    │   │   ├── ChatClient.ts          # Singleton orchestrator: WS, encryption, event dispatch
    │   │   ├── LoggerService.ts       # Structured logging service
    │   │   ├── SocketManager.ts       # Raw WebSocket connection & auto-reconnect
    │   │   ├── WorkerManager.ts       # Crypto Web Worker pool with priority queue
    │   │   ├── interfaces.ts          # Core TypeScript interfaces (IChatClient)
    │   │   └── protocolLimits.ts      # Frame size / rate-limit constants
    │   ├── media/
    │   │   ├── CallService.ts         # WebRTC voice & video call management
    │   │   ├── CompressionService.ts  # Image/file compression before upload
    │   │   ├── FileTransferService.ts # Chunked encrypted file send/receive
    │   │   └── VideoTranscoder.ts     # Video transcoding helper for Android
    │   ├── messaging/
    │   │   ├── MessageService.ts      # Message send/receive, edit, delete, reactions, MANIFEST sync
    │   │   └── SessionService.ts      # Session lifecycle, key derivation, presence, friend requests
    │   ├── mfa/
    │   │   ├── mfa.service.ts              # TOTP generation & verification
    │   │   ├── platform-launch.service.ts  # Platform-specific deep link launcher
    │   │   ├── qr.service.ts               # QR code generation for MFA setup
    │   │   └── secure-storage.adapter.ts   # MFA secret storage adapter
    │   └── storage/
    │       ├── AvatarCacheService.ts  # In-memory LRU cache for peer avatar data URIs
    │       ├── BackupService.ts       # Encrypted ZIP backup & restore
    │       ├── PlatformStorage.ts     # Platform-aware storage abstraction
    │       ├── SafeStorage.ts         # Secure key storage (Keychain/Keystore)
    │       ├── StorageService.ts      # File storage (vault media, avatars, profile images)
    │       ├── StorageUtils.ts        # Storage path/key constants
    │       ├── VaultCrypto.ts         # Vault-specific AES-GCM encryption helpers
    │       └── sqliteService.ts       # SQLite database wrapper & schema
    ├── theme/                     # CSS design tokens
    │   └── variables.css          # Color schemes, spacing, typography
    ├── types/                     # Global TypeScript type declarations
    ├── utils/                     # Pure utility functions
    │   ├── crypto.ts              # Encryption/decryption helpers (ECDH, AES-GCM)
    │   ├── imageUtils.ts          # Image resizing, thumbnail generation
    │   ├── MessageQueue.ts        # Offline message queue implementation
    │   ├── secureStorage.ts       # Low-level Capacitor SecureStorage wrapper
    │   └── trustedDomains.ts      # Allowlist for link previews
    └── workers/                   # Web Workers (off-main-thread processing)
        ├── crypto.worker.ts       # Parallel encryption/decryption worker
    ```

## Server Directory (`/Server`)

    ```
    Server/
    ├── main.go              # Entry point – bootstraps server, DB, and HTTP server
    ├── server.go            # WebSocket upgrade, connection registry, hub
    ├── handlers.go          # Frame handler dispatch for all message types
    ├── auth.go              # Session token generation/validation & Google OAuth verify
    ├── db.go                # SQLite schema init & query helpers
    ├── fcm.go               # Firebase Cloud Messaging (push notifications)
    ├── types.go             # Shared Go structs (Frame, Client, Session, etc.)
    ├── utils.go             # Utility helpers (ID generation, hashing, etc.)
    ├── go.mod               # Go module definition
    ├── go.sum               # Go dependency checksums
    ├── .env                 # Server environment variables (KEEP SECRET!)
    ├── .example.env         # Environment variable template
    ├── website/             # Static landing page assets
    └── readme.md            # Server README
    ```

## Documentation (`/docs`)

    ```
    docs/
    ├── OVERVIEW.md                  # Application overview & target users
    ├── ARCHITECTURE.md              # System architecture & component diagram
    ├── USER_FLOWS.md                # User journey flows with flowcharts
    ├── AUTHENTICATION.md            # Auth system, OAuth, session management
    ├── FEATURES.md                  # Feature-by-feature breakdown
    ├── WEBSOCKET_PROTOCOL.md        # Protocol specification & frame types
    ├── DATABASE.md                  # Database schema, tables, ER diagrams
    ├── SECURITY.md                  # Security protocols & threat model
    ├── DEPLOYMENT.md                # Deployment guide (Android, Electron, server)
    ├── SETUP.md                     # Build & run instructions
    ├── FOLDER_STRUCTURE.md          # This file
    ├── EXPERIMENTAL_VALIDATION.md   # Performance benchmarks & validation results
    ├── ACADEMIC_PROJECT_REPORT.md   # Full academic project report
    └── images/                      # SVG/PNG diagrams referenced by docs
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
| `.env`                 | Server environment variables             | **Yes**      |
| `package-lock.json`    | Locks NPM dependency versions            | No           |
| `go.sum`               | Locks Go dependency versions             | No           |

## Module Organization

### Service Layer (`/Client/src/services`)

Services are organized into domain-specific subdirectories. All services exist outside the React component tree and communicate via events or direct calls.

| Subdirectory   | Responsibility                                                         |
| -------------- | ---------------------------------------------------------------------- |
| `ai/`          | On-device LLM inference (Qwen via WASM or native Llama capacitor plugin) |
| `auth/`        | Google OAuth, account lifecycle, two-phase account switching, token management |
| `core/`        | WebSocket hub, event orchestration, encryption worker pool             |
| `media/`       | WebRTC calls, chunked file transfer, image/video compression           |
| `messaging/`   | Message send/receive/edit/delete, session key derivation, MANIFEST sync, reactions |
| `mfa/`         | TOTP generation/verification, QR codes, secure secret storage          |
| `storage/`     | SQLite, secure key storage, file system, backup/restore, avatar cache  |

**Design Pattern**: Services are singletons, communicate via custom event emitters.

### Component Layer (`/Client/src/components`)

React components organized by functionality:

- **Shared atoms**: `EmojiPicker.tsx`, `GifPicker.tsx`, `UserAvatar.tsx`
- **UI primitives** (`ui/`): `Avatar.tsx`, `Button.tsx`, `Card.tsx`, `IconButton.tsx`
- **Page-specific** components live co-located inside `pages/Home/components/` or `pages/SecureChat/`

**Design Pattern**: Presentational components receive data via props, emit events via callbacks.

### Worker Layer (`/Client/src/workers`)

Web Workers offload heavy CPU-bound operations from the main thread:

- **`crypto.worker.ts`**: Parallel encryption/decryption for message payloads
- **`qwen.worker.ts`**: Legacy worker stub — inference is handled natively via `window.llama` in the Electron main process

### Hook Layer (`/Client/src/hooks` and page-level `hooks/`)

Custom hooks bridge services and components. Page-specific hooks live co-located with their page component rather than in the global hooks directory.

**Design Pattern**: Hooks encapsulate side effects (subscriptions, local state).
