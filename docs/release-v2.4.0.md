# ReplyMate · 答伴

**会议问答助手 · 面试答题神器**

这个版本提供桌面安装包，运行环境和 AI 连接组件已内置。下载后双击启动，答伴会自动在默认浏览器中打开，不需要安装 Node.js、输入命令或编辑配置。

## 选择下载

- **Mac / Apple 芯片（M1、M2 等）**：下载文件名含 `macOS-arm64.dmg` 的安装包。
- **Mac / Intel 芯片**：下载文件名含 `macOS-x64.dmg` 的安装包。
- **Windows / Intel、AMD 64 位**：下载文件名含 `Windows-x64-Setup.exe` 的安装包。

Mac 打开 DMG 后将 ReplyMate 拖入“应用程序”。Windows 双击安装，完成后自动打开，并创建桌面快捷方式。

## 开始使用

打开即可体验示例。生成自己的 AI 回答时，点击“登录 ChatGPT”完成官方账号授权，再点击“选择资料”或拖入文件。登录状态和资料保存在本机，下次启动继续使用。

支持 Word、PowerPoint、PDF 的文字内容，以及 Markdown、TXT 和资料 JSON。导入后立即生效，替换资料时自动备份。扫描图片与图表需要另行整理为文字。

AI 回答需要账号具备 Codex 权限和可用额度。语音收音取决于浏览器支持，可使用 Chrome / Edge 或手动输入。

## 本次发布状态

安装包尚未使用开发者证书签名及 Apple 公证，系统首次打开可能显示安全确认，单位管理的电脑可能限制未签名应用。

各平台构建会通过自动测试、发布文件检查和使用空白账号目录的安装包启动检查后，才进入发布附件。麦克风设备、不同浏览器的语音服务和用户本人登录授权仍需在实际设备上完成。

`SHA256SUMS.txt` 提供安装包校验值。GitHub 自动生成的 `Source code` 是开发源码，普通使用请选择上方安装包。

English: Desktop packages include the runtime and Codex component. Open the app, sign in through the official flow, and import your notes in the page. No terminal or configuration files are required. Packages are currently unsigned and not notarized; first-run OS prompts may apply.
