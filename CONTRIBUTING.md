# Contributing to LinkUp

First off, thank you for considering contributing to LinkUp! It is people like you who make open source such a great place to learn, inspire, and create.

To maintain a healthy, organized, and high-quality codebase, please review and follow these contributing guidelines.

---

## How Can I Contribute?

### 1. Reporting Bugs

Before creating a bug report, please check that:
*   You are using the latest version of LinkUp.
*   The issue hasn't already been reported in the GitHub Issues tracker.

When opening an issue, please include:
1.  **OS details** for both client and host machines (e.g. macOS 14.5 Apple Silicon -> Windows 11 Pro).
2.  **Clear reproduction steps** describing how to trigger the bug.
3.  **Logs or screenshots** (if using Tauri, you can launch from a terminal to see debug logs).

### 2. Suggesting Enhancements

We are always looking for ways to optimize streaming quality and P2P traversal. When suggesting enhancements, describe:
*   The behavior you want to see and why it would be valuable.
*   Any mockups or technical protocols that could implement it.

### 3. Submitting Pull Requests

Please follow this workflow when proposing code changes:

1.  **Fork the repo** and create your branch from `main`:
    ```bash
    git checkout -b my-feature-branch
    ```
2.  **Ensure code quality**:
    *   For Rust code, run `cargo fmt` and `cargo clippy --all-targets` to resolve warnings and format files.
    *   For JavaScript, maintain the clean, Vanilla JS structure and avoid external dependencies unless necessary.
3.  **Test your changes**:
    *   Run `npm run tauri dev` to test the client and host interfaces.
    *   Ensure all existing WebRTC fallback streaming modes function correctly.
4.  **Commit your changes** using conventional commit formats:
    *   `feat: ...` for new features or capabilities.
    *   `fix: ...` for bugs or issues.
    *   `docs: ...` for documentation changes.
    *   `perf: ...` for performance improvements.
5.  **Push to your fork** and submit a Pull Request targeting the `main` branch.

---

## Code of Conduct

By participating in this project, you agree to abide by the standard Contributor Covenant. Please keep discussions civil, constructive, and respectful.
