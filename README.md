# ReplyMate · 答伴

**会议问答助手 · 面试答题神器**

用自己的资料，准备便于口述的英文回答。ReplyMate 适用于会议汇报、面试准备与模拟练习，提供两版英文候选回答、问题的中文翻译、预设快答和历史回看。

[下载安装](https://github.com/wilbert-MD-PhD/ReplyMate/releases/latest) · [English](README.en.md) · [资料格式](docs/library-format.md)

## 下载，打开，就能体验

| 你的电脑 | 下载文件 |
| --- | --- |
| Mac，Apple 芯片（M1、M2 等） | [macOS Apple 芯片版](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.4.0/ReplyMate-2.4.0-macOS-arm64.dmg) |
| Mac，Intel 芯片 | [macOS Intel 版](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.4.0/ReplyMate-2.4.0-macOS-x64.dmg) |
| Windows，Intel / AMD 64 位 | [Windows 安装版](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.4.0/ReplyMate-2.4.0-Windows-x64-Setup.exe) |

**Mac**：打开 DMG，将 ReplyMate 拖入“应用程序”，双击 ReplyMate。

**Windows**：双击安装文件，安装后自动打开，以后点击桌面上的 ReplyMate 图标。

应用会自动在默认浏览器打开答伴。**运行环境和 AI 连接组件已包含在安装包中，无需安装 Node.js、运行命令或编辑配置文件。**

第一次打开可直接点击示例问题体验，演示模式不登录、不调用 AI。需要生成自己的回答时：

1. 点击 **登录 ChatGPT**，在官方登录页面完成授权。返回答伴后自动连接，下次启动保留登录状态。
2. 点击 **选择资料**，或把文件拖到资料区域。导入后立即生效。
3. 输入英文问题，点击 **立即回答**，或使用浏览器支持的语音收音。

当前安装包尚未使用开发者证书签名及 Apple 公证，系统首次打开可能显示安全确认。单位管理的电脑可能限制运行未签名应用。

## 可以放入哪些资料

支持 **Word（DOCX）、PowerPoint（PPTX）、PDF、Markdown、TXT**，以及带预设问答的 [资料 JSON](docs/library-format.md)。每次导入一份文件，最大 20 MB。提取后的文字最大 1 MB，资料 JSON 最大 5 MB。

文档在本机读取，提取文字内容。扫描图片、图表和公式需要自行核对或补充为文字。没有可读取文字时会提示导入失败，并保留原资料。

更换资料时会自动备份旧资料并清空本页问答，请先复制需要保留的回答。普通文档导入后会清空示例预设，避免把示例答案用于自己的问题。要设置预设快答，可按资料格式编辑 JSON，只把核对完成的答案标记为 `reviewed: true`。

摘要取文本前 12,000 字符，每次提问再检索最多三个相关片段。建议把概要、关键数据和常见问题放在资料前部。当前检索以英文关键词为主。

## 使用方式

- **双版回答**：快速回答和第二回答分别排队、逐步显示，方便比较。第二回答也是候选答案，需要自行核对事实。
- **手动提问**：输入英文问题，点击按钮，或按 `Ctrl+Enter` / `Command+Enter`。
- **连续收音**：浏览器支持语音识别并获得麦克风权限后，可在停顿后自动提交问题。按 `Esc` 暂停。建议使用支持语音识别的 Chrome 或 Edge。
- **历史与重答**：回看上一题、下一题，修改问题后重新回答，或返回现场自动跟随。
- **模型选择**：登录后自动选择账号中的可用模型，默认无需修改。模型预热为可选功能。
- **退出**：点击页面底部“退出答伴”，或从菜单栏 / 系统托盘退出。关闭浏览器标签页后，答伴仍在后台运行。

语音识别是否可用取决于浏览器和设备，手动输入随时可用。刷新或关闭页面会清空当前问答和录音，导入资料和登录状态保留。

## 账号、资料与隐私

AI 回答需要支持 Codex 的账号权限及可用额度。双回答、中文翻译、预热和竞速都会消耗你自己的额度，离线演示不消耗。模型列表不代表每个模型都可成功调用，权限和额度以实际请求为准。

桌面版将资料、备份和账号状态保存在自己的应用数据目录，与程序安装位置分开。升级安装包不会替换这些数据。账号授权由内置的官方 Codex 组件处理，答伴不要求填写密码或复制令牌，登录流程使用 [Codex App Server](https://learn.chatgpt.com/docs/app-server)。

- 界面服务只监听本机 `127.0.0.1`，端口自动分配。
- 本工具不保存问答日志。录音只保留在当前页面内存中。
- 浏览器语音识别可能把音频发送给浏览器供应商。演示答题可离线，浏览器收音未必离线。
- 启用 AI 后，问题、近期问题、转写候选、资料摘要和相关片段会发送到模型服务，保留规则取决于该服务。
- 退出账号只退出答伴的登录，不删除你的资料。

## 源码运行与开发

普通用户请下载上方桌面安装包。开发者需要 Node.js 22.13 或更新版本：

```sh
npm ci --ignore-scripts
npm start
```

源码版默认打开离线演示服务，浏览器访问 [http://127.0.0.1:8780](http://127.0.0.1:8780)。要使用源码版的 AI 功能，先安装 Codex CLI，再点击页面中的登录按钮。开发配置可参考 `.env.example`。

```sh
npm test
npm run check
npm run package
node node_modules/electron/install.js
npm run desktop:build
```

桌面打包会内置 Electron 运行环境和与系统架构匹配的 Codex 组件。GitHub Actions 在 macOS Apple 芯片、macOS Intel 和 Windows 上分别打包并进行独立首次启动检查。源码 ZIP 与桌面安装包是不同交付物。

可选的本地 Whisper 语音识别供源码使用者配置，说明见 [开发说明](docs/development.md)。[验证范围](docs/validation.md) 记录实际检查内容。

MIT 许可。附带及单独安装的组件遵循各自许可，见 [第三方组件](THIRD_PARTY_NOTICES.md)。
