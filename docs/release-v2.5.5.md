# ReplyMate 2.5.5 · 检索与问答修复

- 修复单个关键词匹配资料时，相关片段可能被过滤的问题。
- 修复快速回答生成期间重答深度回答，可能保存不完整快速回答的问题，同时保留原回答的完成或失败状态。
- 修复安静环境下音量阈值设置可能不起作用的问题。

## 下载

- [macOS Apple 芯片](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.5/ReplyMate-2.5.5-macOS-arm64.dmg)
- [macOS Intel](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.5/ReplyMate-2.5.5-macOS-x64.dmg)
- [Windows x64](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.5/ReplyMate-2.5.5-Windows-x64-Setup.exe)

可选组件可在软件内安装或手动导入对应平台的组件附件。校验值见 `SHA256SUMS.txt`。

## 验证范围

自动回归测试覆盖低分关键词检索、快速回答生成期间的深度重答及音量阈值。桌面安装包由 GitHub Actions 在各目标平台构建并运行冒烟测试。音量阈值测试使用模拟音频帧，未验证真实麦克风或各语种识别质量。安装包未签名或公证。
