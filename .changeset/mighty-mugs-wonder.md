---
'blowback-context': major
---

- Add MCP prompt for AI guidance on checkpoints and screenshots
- Return screenshot metadata instead of base64 by default
- Add ENABLE_BASE64 env var to control image encoding
- Improve URL parsing and pathname normalization

BREAKING CHANGE: Screenshot resources now return metadata only. Use ENABLE_BASE64=true for base64 images
