# ReplyMate 2.5.7 · 组件、问答与语音设置修复

- 修复反复安装或修复组件后旧版本文件持续占用空间的问题。成功切换后保留当前版本及一个可回滚版本，清理符合组件版本目录格式的多余目录。
- 修复长中文问题携带近期问题和转写候选时，因请求体字节限制过小而被拒绝的问题。
- 修复中文语音识别设置下，手动输入的英文问题被误当作中文原文的问题。中英文混合问题也会进入翻译通道。
- 修复多个页面之间语音设置不同步的问题。其他页面修改语音配置时，正在收音的页面会暂停并提示用户检查设置。

## 下载

- [macOS Apple 芯片](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.7/ReplyMate-2.5.7-macOS-arm64.dmg)
- [macOS Intel](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.7/ReplyMate-2.5.7-macOS-x64.dmg)
- [Windows x64](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.7/ReplyMate-2.5.7-Windows-x64-Setup.exe)

可选组件可在软件内安装或手动导入对应平台的组件附件。校验值见 `SHA256SUMS.txt`。

## 验证范围

自动回归覆盖组件清理与回滚、安装失败时保留旧版本、长中文请求及语言判断。离线浏览器测试覆盖多页面语言同步和中文识别设置下的英文提问。桌面安装包由 GitHub Actions 在各目标平台构建并运行冒烟测试。未验证真实麦克风或真实账号生成质量。安装包未签名或公证。
