# Blowback MCP

## 1.0.1

### Patch Changes

- f21f64d: - Replaced better-sqlite3 with node-sqlite3-wasm for node version compatibility
  - Fixed typo in init prompt message

## 1.0.0

### Major Changes

- 4f73613: - Add MCP prompt for AI guidance on checkpoints and screenshots

  - Return screenshot metadata instead of base64 by default
  - Add ENABLE_BASE64 env var to control image encoding
  - Improve URL parsing and pathname normalization

  BREAKING CHANGE: Screenshot resources now return metadata only. Use ENABLE_BASE64=true for base64 images

### Minor Changes

- 5c44b5a: Replace Puppeteer with Playwright

## 0.4.0

### Minor Changes

- 75ed979: - Update capture-screenshot tool description
  - Add guidance on handling screenshot images due to MCP client limitations

## 0.3.1

### Patch Changes

- e17d00d: Update README.md

## 0.3.0

### Minor Changes

- 005b0f9: Package name is changed (Blowback)

## 0.2.0

### Minor Changes

- b19bb2a: Added 'how-to-use' tool to provide usage instructions for the MCP client
- 9698194: Refactoring logging system to improve memory effciency
- 56de1e3: Enhanced HMR tools with better event monitoring and improved console debugging features

## 0.1.1

### Patch Changes

- d05245e: fix lockfile
- d2fd853: Initial release
