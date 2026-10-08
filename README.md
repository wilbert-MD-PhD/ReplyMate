# ReplyMate · 答伴

**会议问答神器 · 面试答题神器**

ReplyMate（答伴）是一款开源的英文问答辅助工具，适用于会议汇报、面试准备与模拟练习。
导入自己的资料后，可生成两版便于口述的英文回答，并查看问题的中文翻译。

工具在本机浏览器中使用，采用中文界面，支持文字输入、语音收音、预设快答、历史回看和修改重答。
两个英文回答独立排队并逐步显示，方便比较和选择。

[English](README.en.md) · [下载最新版](https://github.com/wilbert-MD-PhD/ReplyMate/releases/latest) · [资料格式](docs/library-format.md) · [验证范围](docs/validation.md)

## 下载后快速体验

需要 **Node.js 22 或更新版本**，从 [Node.js 官网](https://nodejs.org/) 安装。
应用没有第三方 npm 运行依赖，不需要构建前端，也不需要 Python。

1. 在 [Releases](https://github.com/wilbert-MD-PhD/ReplyMate/releases/latest) 下载最新版 ZIP 压缩包并解压。
2. 在解压后的目录运行 `npm start`。也可双击 macOS 的 `start.command` 或 Windows 的 `start.bat`，Linux 执行 `sh start.sh`。
3. 打开 **http://127.0.0.1:8780**，点击页面下方的 `Project purpose` 示例问题。

默认是**离线演示**：不需要登录，不调用 AI。预设答案和资料摘录均来自虚构的“社区用电看板”示例。
这用于体验交互，真实回答和自动翻译需要下面的 Codex 配置。

## 启用真实 AI

安装 [Codex CLI](https://developers.openai.com/codex/cli/)，运行 `codex login` 完成自己的登录。
本工具通过官方 [Codex App Server](https://learn.chatgpt.com/docs/app-server) 的本机进程连接。
无需把账号、密码或令牌填入本工具。

```sh
npm install -g @openai/codex
codex login
```

将 `.env.example` 复制为 `.env`，用文本编辑器把 `QA_BACKEND=demo` 改为：

```dotenv
QA_BACKEND=codex
PORT=8780
CODEX_BIN=codex
```

停止旧服务并重新运行 `npm start`。页面应显示 `Codex 已连接`。
如命令不可见，将 `CODEX_BIN` 设为自己电脑上的可执行文件路径。
Windows 的 Codex 后端建议在 WSL 中运行整个应用，演示模式可以直接使用 `start.bat`。

- 模型列表从当前账户读取。默认使用列表推荐模型，第二回答默认使用同一模型的独立会话。
- 可在 `.env` 设置 `QA_FAST_MODEL`、`QA_SECONDARY_MODEL`，切换到列表中的模型。修改后重启。
- `QA_FAST_EFFORT`、`QA_SECONDARY_EFFORT` 留空时选模型支持的较低推理强度。指定值不受支持时会报错。
- 列表出现某模型不保证当前账户能完成推理，权限和额度以实际请求结果为准。
- 双回答、中文翻译、预热及竞速都会消耗自己的模型额度。预热由按钮手动触发。

## 换成自己的资料

在终端进入本工具目录，运行：

```sh
npm run import -- "/path/to/your-notes.md"
```

支持 `.md`、`.txt` 和本工具格式的 `.json`。文本资料上限 1 MB，JSON 上限 5 MB。
PPTX、DOCX、PDF 请先导出或整理为文本，公式和图片内容需要手工补充。

导入结果保存在 `user-data/reference.json`。已有资料先在同目录备份，再替换。
重启服务并刷新页面后生效。导入文本会清空示例预设，避免旧答案混入新资料。
需要预设快答时，按 [资料格式](docs/library-format.md) 编辑 JSON 并重新导入。
只把核对完成的答案设为 `reviewed: true`。

摘要使用资料前 12,000 字符，并按当前问题检索最多三个片段。
长文建议先整理摘要、常见问答和关键数据。检索依赖英文关键词，当前版本面向英文会议。

## 现场使用

- **立即回答**：输入英文问题，点击按钮或按 `Ctrl+Enter` / `Command+Enter`。
- **双回答**：快速回答与第二回答各自排队，后续问题不会覆盖前一题。第二回答也是候选答案，不代表独立事实核验。
- **预设快答**：仅精确匹配已确认的问法，保留数字、否定和复合问题的差别。
- **历史与重答**：上一题、下一题、回到现场、修改问题、两版重新回答。历史答案保留在本页。
- **收音**：浏览器支持并授予麦克风权限后可自动断句入队。按 `Esc` 暂停。没有说话人识别，自己回答时可暂停。
- **刷新页面**会清除本页的问答与录音。请提前复制需要保留的答案。

## 可选本地语音识别

手动输入和浏览器语音识别不需要本地模型。
如果希望本地转写，请单独安装 [whisper.cpp](https://github.com/ggml-org/whisper.cpp) 的 `whisper-server`，
并按该项目说明下载兼容的模型。模型文件及二进制不在本下载包中。

在 `.env` 配置自己的路径，例如：

```dotenv
WHISPER_BIN=whisper-server
WHISPER_MODEL=models/your-whisper-model.bin
```

重启后，页面显示 `本地 Whisper 已就绪` 才启用本地转写选项。
Whisper 的命令行参数可能随版本变化，请使用支持 `--request-path`、`--public` 和 `/inference` 的服务版本。
真实口音、设备、浏览器和本地模型的识别效果需在自己的设备上验证。

## 资料存储与隐私

- 导入的资料保存在本机 `user-data/` 目录，可自行备份或删除。
- 服务只监听 `127.0.0.1`，仅提供明确列出的前端文件。修改请求需要同源会话令牌。
- 本工具不保存问答日志或上传录音。原音留在浏览器内存，本地转写时发往本机 Whisper 服务。
- 浏览器语音识别可能发送音频到浏览器供应商。**“离线演示”指答题后端，使用浏览器收音不保证离线。**
- Codex 模式会把问题、近期问题、转写候选、摘要及检索片段发送给配置的模型服务。保留规则取决于 Codex 和模型服务。
- `.env`、`user-data/`、`models/`、日志和录音不在版本控制和发布清单中。勿把个人资料放进 `examples/` 或提交到公开仓库。

## 开发与打包

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run package
```

打包结果在 `dist/`：ZIP、逐文件 SHA-256 清单和 `SHA256SUMS.txt`。
打包只读取 `scripts/release-files.mjs` 的明确清单，不遍历或复制工作目录中的个人资料。
GitHub Actions 检查 Node.js 22/24 在 macOS、Linux、Windows 上的测试与打包。

MIT 许可。独立安装的运行时、Codex、Whisper 和模型遵循各自的许可及服务条款。
