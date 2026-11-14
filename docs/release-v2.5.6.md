# ReplyMate 2.5.6 · 资料、组件与语音修复

- 修复长资料在分块边界可能漏检关键词的问题。已导入的旧资料也会在检索时兼容处理，无需重新导入。
- 修复组件依赖文件缺失时，安装计划可能遗漏该依赖的问题。
- 修复语音问题去重忽略比较符号、正负号等内容，可能丢弃不同问题的问题。

## 下载

- [macOS Apple 芯片](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.6/ReplyMate-2.5.6-macOS-arm64.dmg)
- [macOS Intel](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.6/ReplyMate-2.5.6-macOS-x64.dmg)
- [Windows x64](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.6/ReplyMate-2.5.6-Windows-x64-Setup.exe)

可选组件可在软件内安装或手动导入对应平台的组件附件。校验值见 `SHA256SUMS.txt`。

## 验证范围

自动回归测试覆盖新旧资料的分块边界、缺失依赖的安装，以及语音问题中的比较符号和数值。桌面安装包由 GitHub Actions 在各目标平台构建并运行冒烟测试。未验证真实麦克风或真实账号生成质量。安装包未签名或公证。
