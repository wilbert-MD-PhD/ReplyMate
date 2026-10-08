// Explicit release allowlist. Local inputs, credentials, recordings and caches never enter the archive.
export const releaseFiles=[
 '.env.example','.gitignore','.gitattributes','.github/workflows/ci.yml',
 'LICENSE','README.md','README.en.md','CHANGELOG.md','SECURITY.md','THIRD_PARTY_NOTICES.md',
 'package.json','package-lock.json','start.command','start.sh','start.bat',
 'config.mjs','library.mjs','server.mjs','bridge.mjs','demo.mjs','core.mjs','asr.mjs',
 'examples/reference.json','examples/notes.md','docs/library-format.md','docs/validation.md',
 'public/index.html','public/app.js','public/style.css','public/pcm-worklet.js','public/logic.mjs',
 'public/capture.mjs','public/speech-pipeline.mjs','public/answer-lanes.mjs','public/prepared.mjs','public/session-fetch.mjs',
 'scripts/import-library.mjs','scripts/release-files.mjs','scripts/check-release.mjs','scripts/package-release.mjs',
 'test/audio-worklet.test.mjs','test/capture.test.mjs','test/meeting.test.mjs','test/dual-answer.test.mjs',
 'test/race.test.mjs','test/library.test.mjs','test/server.test.mjs','test/session-fetch.test.mjs'
].sort();
