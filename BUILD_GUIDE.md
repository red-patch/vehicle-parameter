# Build Guide for Vehicle Parameter Tool

This project uses [Tauri](https://tauri.app/) to build a native desktop application for macOS and Windows.

## Prerequisites

To build the desktop application, you must have **Rust** and **Node.js** installed on your machine.

### 1. Install Rust

Follow the official instructions: [https://www.rust-lang.org/tools/install](https://www.rust-lang.org/tools/install)

**macOS / Linux:**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Windows:**
Download and run `rustup-init.exe` from [https://rustup.rs/](https://rustup.rs/).

### 2. Install Node.js

Ensure Node.js (v16+) is installed.

## Building the App

1.  **Install Dependencies:**

    ```bash
    npm install
    ```

2.  **Run in Development Mode:**
    (Starts the frontend and the desktop window)

    ```bash
    npm run tauri dev
    ```

3.  **Build for Production:**
    (Generates `.dmg` for macOS or `.msi/.exe` for Windows)
    ```bash
    npm run tauri build
    ```

## Output Locations

After a successful build, the installer/binary will be located at:

- **macOS**: `src-tauri/target/release/bundle/dmg/`
- **Windows**: `src-tauri/target/release/bundle/msi/`

## Troubleshooting

- **"Command not found: cargo"**: Ensure Rust is installed and `~/.cargo/bin` is in your PATH.
- **Build Fails**: Try running `cargo update` inside the `src-tauri` folder to update Rust dependencies.
