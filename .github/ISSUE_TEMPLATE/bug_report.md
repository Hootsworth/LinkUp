name: Bug Report
description: Create a report to help us improve LinkUp
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Thank you for reporting this issue! Please provide as much detail as possible to help us reproduce and fix it.
  - type: input
    id: version
    attributes:
      label: LinkUp Version
      description: What version of LinkUp are you running? (e.g. v0.3.0)
      placeholder: v0.3.0
    validations:
      required: true
  - type: dropdown
    id: host_os
    attributes:
      label: Host Operating System
      description: What operating system is the HOST (sharing screen) running?
      options:
        - macOS (Apple Silicon)
        - macOS (Intel)
        - Windows 10 / 11
        - Linux (Ubuntu / Debian)
        - Other
    validations:
      required: true
  - type: dropdown
    id: client_os
    attributes:
      label: Client Operating System
      description: What operating system is the CLIENT (viewing screen) running?
      options:
        - macOS (Apple Silicon)
        - macOS (Intel)
        - Windows 10 / 11
        - Linux (Ubuntu / Debian)
        - Other
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to Reproduce
      description: Detail the steps to trigger this behavior.
      placeholder: |
        1. Start Host mode on Host PC and copy code.
        2. Click Client mode on Client PC and enter code.
        3. Click Connect...
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Logs or Terminal Output
      description: Paste any console errors, Rust panic logs, or webview console logs here.
      render: shell
