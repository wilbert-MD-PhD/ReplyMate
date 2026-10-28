# ReplyMate 2.5.4 · 语音与组件下载修复

- 修复持续说话被误判为停顿，可能导致本地语音问题提前截断的问题。
- 修复完整下载缓存校验失败后，继续重试反复收到 HTTP 416 的问题。损坏缓存会重新下载。
- 包含自 2.5.3 以来已合并的资料库跨页面同步、检索片段、预设问答匹配与页面会话清理改进。

## 下载

- [macOS Apple 芯片](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.4/ReplyMate-2.5.4-macOS-arm64.dmg)
- [macOS Intel](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.4/ReplyMate-2.5.4-macOS-x64.dmg)
- [Windows x64](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.4/ReplyMate-2.5.4-Windows-x64-Setup.exe)

可选组件可在软件内安装或手动导入对应平台的组件附件。校验值见 `SHA256SUMS.txt`。

## 验证范围

新增自动测试覆盖持续语音后的停顿提交，以及完整损坏缓存的重新下载和安装。桌面安装包由 GitHub Actions 在各目标平台构建和运行冒烟测试。语音回归使用模拟音量帧，未验证真实麦克风或各语种识别质量。安装包未签名或公证。
