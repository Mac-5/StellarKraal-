# Local Development Setup Guide (Non-Docker)

This guide walks you through setting up the StellarKraal environment for local development without using Docker. This approach is recommended for faster iteration and debugging.

## Prerequisites

Ensure you have the following installed on your machine before you begin:

*   **Node.js**: v20 or higher
*   **npm**: Included with Node.js
*   **Rust**: Latest stable version (via `rustup`)
*   **Stellar CLI**: Installed via cargo
*   **Freighter Wallet**: Browser extension for testing the frontend
*   **SQLite**: Required for the backend database

### Platform-Specific Notes

#### macOS
*   Install Xcode Command Line Tools: `xcode-select --install`
*   Install SQLite via Homebrew (optional, usually pre-installed): `brew install sqlite`

#### Linux (Ubuntu/Debian)
*   Install build essentials and SQLite: `sudo apt update && sudo apt install build-essential libssl-dev pkg-config sqlite3 libsqlite3-dev`

#### Windows (WSL2)
*   **Important**: We highly recommend using WSL2 (Windows Subsystem for Linux) running an Ubuntu distribution.
*   Do not develop directly in the Windows filesystem; clone the repository into your WSL2 home directory (e.g., `~/StellarKraal-`).
*   Follow the Linux (Ubuntu/Debian) notes above inside your WSL2 terminal.

---

## Windows / WSL2 Setup

This section covers setting up StellarKraal on Windows. The recommended path is **WSL2 with an Ubuntu distribution**; native Windows is supported but has more caveats (see below).

### 1. Install WSL2 and Ubuntu

From an elevated PowerShell prompt:

```powershell
wsl --install -d Ubuntu
```

Reboot if prompted, then launch Ubuntu from the Start menu and create your Linux user. Verify you are on WSL2:

```bash
wsl.exe -l -v
```

The `VERSION` column for your Ubuntu distro should read `2`. If it reads `1`, upgrade it:

```powershell
wsl --set-version Ubuntu 2
```

### 2. Install Node.js via nvm

**Inside WSL2 (Ubuntu):** use `nvm` for Linux.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# Reload your shell so nvm is on PATH
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
node --version   # should print v20.x or higher
```

**Native Windows (optional):** use [nvm-windows](https://github.com/coreybutler/nvm-windows). Note that nvm-windows is a separate project from nvm and uses different commands.

```powershell
# Install nvm-windows via winget (or download the installer from the releases page)
winget install CoreyButler.NVMforWindows
# Open a new terminal, then:
nvm install 20
nvm use 20
node --version
```

> If you develop in WSL2, install Node.js **inside WSL2** (not just on Windows). Running `npm install` from a Windows-installed Node against files in the Linux filesystem causes permission and performance problems.

### 3. Docker on WSL2

If you need Docker (e.g. for `stellar network start local`), install **Docker Desktop for Windows** and enable the WSL2 backend:

1.  Install Docker Desktop and open **Settings → General**.
2.  Enable **Use the WSL 2 based engine**.
3.  Under **Settings → Resources → WSL Integration**, enable integration for your Ubuntu distro.
4.  Restart Docker Desktop, then verify from inside WSL2:
    ```bash
    docker version
    docker run --rm hello-world
    ```

**Docker socket access:** Docker Desktop exposes the daemon to WSL2 automatically. If `docker` commands fail with `permission denied while trying to connect to the Docker daemon socket`, ensure WSL integration is enabled for your distro and that your user is in the `docker` group:

```bash
sudo usermod -aG docker $USER
# Log out and back in (or run `newgrp docker`) for the group change to apply
```

If you instead run Docker Engine natively inside WSL2 (without Docker Desktop), start it with `sudo service docker start` and confirm the socket exists at `/var/run/docker.sock`.

### 4. File Permissions and Filesystem Considerations

WSL2 can access both the Linux filesystem and the Windows drives mounted under `/mnt/c`, but they behave very differently:

*   **Clone into the Linux filesystem.** Keep the repo under your WSL2 home directory (e.g. `~/StellarKraal-`), **not** under `/mnt/c/Users/...`. Cross-filesystem access is dramatically slower and breaks file watching, `npm install`, and executable bits.
*   **Line endings.** Windows tools may introduce CRLF line endings, which break shell scripts and can cause noisy diffs. Configure Git to keep LF inside the repo:
    ```bash
    git config --global core.autocrlf input
    ```
    If files were already checked out with CRLF, re-normalize them:
    ```bash
    git rm --cached -r . && git reset --hard
    ```
*   **Executable bits.** Files on `/mnt/c` cannot store Unix permission bits, so scripts may lose their executable flag. Cloning into the Linux filesystem avoids this. If a script is not executable, restore it with `chmod +x <script>`.
*   **Ownership.** If you previously cloned as `root` (e.g. via `sudo`), fix ownership with `sudo chown -R $USER:$USER ~/StellarKraal-`.

### 5. Continue with the Standard Setup

Once Node.js, Rust, and (optionally) Docker are working inside WSL2, continue from [Environment Configuration](#1-environment-configuration) below. All commands in the rest of this guide run inside your WSL2 Ubuntu terminal.

---

## 1. Environment Configuration

Clone the repository and set up the environment variables.

```bash
git clone https://github.com/<your-username>/StellarKraal-.git
cd StellarKraal-
cp env.example .env
```

Ensure your `.env` file contains the correct values. The defaults in `env.example` are usually sufficient for local development.

---

## 2. Smart Contract Setup

The smart contracts are written in Rust using the Soroban SDK.

### Setup Rust Toolchain

1.  Add the `wasm32-unknown-unknown` target:
    ```bash
    rustup target add wasm32-unknown-unknown
    ```
2.  Install the Stellar CLI:
    ```bash
    cargo install --locked stellar-cli --features opt
    ```

### Build and Test

Navigate to the contract directory and build/test the contract:

```bash
cd contracts/stellarkraal
cargo build --target wasm32-unknown-unknown --release
cargo test
```

### Local Soroban Sandbox

To test the contract end-to-end against a local network instead of testnet:

```bash
# Start a local Soroban network (requires Docker)
stellar network start local

# Add the local network alias if not already configured
stellar network add local --rpc-url http://localhost:8000/soroban/rpc --network-passphrase "Standalone Network ; February 2017"

# Create and fund an identity for deployments
stellar keys generate dev-deployer --network local
stellar keys fund dev-deployer --network local

# Deploy the built contract and capture the resulting contract id
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellarkraal.wasm \
  --source dev-deployer \
  --network local
```

Use the printed contract id as `CONTRACT_ID` and `http://localhost:8000/soroban/rpc` as `STELLAR_RPC_URL` in your backend `.env` when testing against the local sandbox.

---

## 3. Backend Setup

The backend is a Node.js + TypeScript Express application using SQLite as the database.

### Setup

Navigate back to the project root and into the backend directory:

```bash
cd ../../backend
npm install
```

### Database Migration

The backend uses `db-migrate` for SQLite database migrations. Run the development migrations:

```bash
npm run migrate:dev
```
*Note: This will create a `database.sqlite` (or similarly named) file in your backend directory as configured by `database.json`.*

### Run the Backend

Start the development server:

```bash
npm run dev
```

The backend API will be available at `http://localhost:3001` (or the port specified in your `.env` file).

---

## 4. Frontend Setup

The frontend is built with React, Next.js 14, and Tailwind CSS.

### Setup

Open a new terminal window, navigate to the frontend directory:

```bash
cd frontend
npm install
```

### Run the Frontend

Start the Next.js development server:

```bash
npm run dev
```

The frontend application will be available at `http://localhost:3000`.

---

## Common Setup Errors and Solutions

### Node.js / NPM Issues
*   **Error:** `npm ERR! code ERESOLVE` or dependency conflicts.
    *   **Solution:** Ensure you are using Node.js v20+. If the issue persists, try deleting `node_modules` and `package-lock.json`, then run `npm install` again.

### Backend Issues
*   **Error:** `Error: sqlite3 module not found` or `Error: Cannot find module 'sqlite3'`.
    *   **Solution:** This typically happens if `sqlite3` failed to build for your architecture. Ensure you have the necessary build tools (see Platform-Specific Notes). Try running `npm rebuild sqlite3` in the `backend` directory.
*   **Error:** `PORT already in use`.
    *   **Solution:** Another service is using port 3001. Stop that service or change the `PORT` variable in your `.env` file.

### Smart Contract / Rust Issues
*   **Error:** `error: failed to run custom build command for 'soroban-env-host'`.
    *   **Solution:** Ensure you have the `wasm32-unknown-unknown` target installed (`rustup target add wasm32-unknown-unknown`).
*   **Error:** `stellar: command not found`.
    *   **Solution:** Ensure `~/.cargo/bin` is added to your system's `PATH`.

### Frontend Issues
*   **Error:** API requests from frontend failing with `CORS policy`.
    *   **Solution:** Ensure `FRONTEND_URL=http://localhost:3000` is set in your `.env` file and the backend server is running.

### Windows / WSL2 Issues
*   **Error:** `docker: permission denied while trying to connect to the Docker daemon socket`.
    *   **Solution:** Enable WSL integration for your distro in Docker Desktop and add your user to the `docker` group (see [Docker on WSL2](#3-docker-on-wsl2)).
*   **Error:** `npm install` is extremely slow or file watching does not work.
    *   **Solution:** You are likely working under `/mnt/c`. Clone the repository into your WSL2 home directory instead.
*   **Error:** Shell scripts fail with `bad interpreter: /bin/bash^M` or `$'\r': command not found`.
    *   **Solution:** CRLF line endings were introduced. Set `git config --global core.autocrlf input` and re-checkout the files.
