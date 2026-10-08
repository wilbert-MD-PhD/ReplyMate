# Third-party components

ReplyMate and its fictional demo material use the MIT license. Third-party components retain their own licenses and source provenance.

The core desktop package contains Electron (MIT), Chromium and Node.js with Electron's accompanying license notices. Optional components are distributed separately:

- Codex CLI 0.161.0: Apache-2.0, from https://github.com/openai/codex. The full vendor runtime is retained, with LICENSE and source/version in the component catalog.
- Office text reader: fflate 0.8.2 (MIT), saxes 6.0.0 (ISC), xmlchars (MIT), with their package license files and lockfile.
- PDF text reader: pdfjs-dist 6.2.108 (Apache-2.0) and its platform Canvas dependencies. Package license files, fonts, CMaps, worker and WASM remain with the component. OCR is not included.
- whisper.cpp 1.9.5, commit d1be6fde11ac6e0407606b4e42fe72d34add8037: MIT, from https://github.com/ggml-org/whisper.cpp. The engine includes provenance for the local-request boundary patch, upstream LICENSE, and third-party header license notices.
- Whisper model weights: MIT; fixed ggerganov/whisper.cpp revision 5359861c739e955e79d9a303bcbc70fb988958b1 at https://huggingface.co/ggerganov/whisper.cpp. Each file has a distinct pinned size and SHA-256 in the catalog; languages share multilingual weights.

Browser recognition may use the browser vendor's online service. Codex login and AI access remain subject to the account provider's terms. This project's license does not replace third-party licenses or grant rights to third-party services or accounts.
