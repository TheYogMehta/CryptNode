# Setup & Installation

## Prerequisites

- **Node.js** (v18+)
- **Go** (v1.20+)
- **Android Studio** (for Android builds)
- **Google Cloud Console** Project (for OAuth keys)

## 1. Backend Setup (Server)

The server is a lightweight Go application.

### Server Installation

1. Navigate to the `Server` directory.

   ```bash
   cd Server
   ```

2. Initialize dependencies (if not already done).

   ```bash
   go mod init socket
   go get github.com/gorilla/websocket
   go get github.com/joho/godotenv
   go get github.com/mattn/go-sqlite3
   ```

### Configuration

1. Copy the example environment file:

   ```bash
   cp .example.env .env
   ```

2. Ensure the following variables are configured in `.env`:
   - `SESSION_SECRET`: Secret key for HMAC token signing.
   - `TURN_HOST`: URL/IP for the TURN relay server (optional for local dev).
   - `TURN_SECRET`: Secret for deriving ephemeral TURN credentials (optional).

### Running the Server

```bash
go run .
```

The server listens on `ws://localhost:9000`.

---

## 2. Frontend Setup (Client)

The client is a React application using Vite and Capacitor.

### Client Installation

1. Navigate to the `Client` directory.

   ```bash
   cd Client
   ```

2. Install dependencies.

   ```bash
   npm install
   ```

3. **Configuration**: Ensure you have valid Google OAuth credentials.
   - Place `google-services.json` in `android/app/` (for Android).
   - Configure Client IDs in your environment or constants.

### Building Application

The build command handles all preparation steps including:

- Building React application with Vite
- Syncing with Capacitor for Android
- Copying assets for Electron

```bash
npm run build
```

> [!NOTE]
> This single command prepares the application for both Android and Electron platforms. You don't need to run separate build or sync commands.

### Running Android

After building, open the project in Android Studio:

```bash
npx cap open android
```

Then run the app from Android Studio on an emulator or physical device.

### Running Electron (Desktop)

After building, start the Electron app:

```bash
npm run electron:start
```
