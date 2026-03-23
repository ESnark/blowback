---
"blowback-context": patch
---

fix: resolve ESLint errors and bug fixes

- Fix unused import and case block scope issues in context-manager
- Fix network monitor event listener leak in browser-tools (try-finally)
- Fix race condition in log-manager by awaiting detachCheckpointStreams()
