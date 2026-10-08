# 开发与可选配置

v2.5 桌面安装包包含主程序运行环境。AI 回答、文档解析和本地语音通过组件中心按需安装，普通用户无需安装系统 Node.js、npm 或 Codex。

源码模式需要 Node.js 22.13+，先运行 `npm ci --ignore-scripts`。默认 `npm start` 启动离线演示，安装 Codex CLI 后可通过页面按钮登录。设置 `QA_BACKEND=auto` 可在启动时检查现有登录，未登录时保留演示。`QA_BACKEND=codex` 同样会在启动时连接 Codex，未登录时可通过页面完成登录。

`.env.example` 列出可选模型、端口及语音设置。默认快速通道使用两个可用模型竞速（优先纳入账号默认模型，排除独立深度模型），先返回非空正文者胜出。候选列表不是实测延迟排名，页面会显示实际候选。`QA_FAST_MODEL` 留空或设为 `race` 开启默认竞速，也可填单模型 ID。`QA_SECONDARY_MODEL` 留空时使用 `gpt-6-astra`，不可用时提示用户选择，避免静默替换。页面中的深度模型选择在当前会话有效。

快速模型默认使用支持的最低推理强度；深度模型使用目录中的默认推理强度。`QA_FAST_EFFORT` 和 `QA_SECONDARY_EFFORT` 可覆盖这两个默认值，但必须受所选模型支持。两路使用独立会话和队列，竞速取消仅作用于快速通道。

## 可选本地语音识别

源码模式可单独安装 [whisper.cpp](https://github.com/ggml-org/whisper.cpp) 的 `whisper-server` 和兼容模型，在 `.env` 设置：

```dotenv
WHISPER_BIN=whisper-server
WHISPER_MODEL=models/your-whisper-model.bin
```

重启后，页面显示“本地 Whisper 已就绪”才表示可用。使用支持 `--request-path`、`--public` 和 `/inference` 的服务版本。桌面版通过组件中心安装本地 Whisper 引擎和模型，也可选择系统浏览器语音识别。详见 [组件开发与验收](components.md)。

## 桌面包

测试文档解析前安装两组插件依赖，再执行自动测试与源码打包检查：

```sh
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix plugins/docs-office
npm ci --ignore-scripts --prefix plugins/docs-pdf
npm test
npm run check
npm run package
```

桌面组件构建需要 CMake 与目标平台编译工具，详细要求见 [组件开发与验收](components.md)。在目标操作系统和架构上执行：

```sh
node node_modules/electron/install.js
npm run whisper:build
npm run desktop:build
npm run desktop:audit
node scripts/smoke-desktop.mjs
```

主程序安装包输出到 `dist/desktop/`，独立组件输出到 `dist/components/`。`scripts/build-components.mjs` 从固定依赖构建目标架构组件并生成大小与哈希目录，`scripts/prepare-desktop.mjs` 准备不含这些可选运行组件的核心目录。安装包不包含个人资料、账号或开发配置。

桌面应用启动本机服务并自动打开默认浏览器。`PORT=0` 由操作系统分配端口。资料在 Electron 的应用数据目录下 `data/`，独立登录状态在 `account/`，与源码用户的 Codex 配置分开。

首次启动检查使用临时空账户目录，验证没有安装组件时的演示、TXT 导入，以及导入 Word 时的缺少组件提示，不读取维护者的登录凭据，不发送 AI 生成请求。组件安装与自检单独验证，正式发布前还需人工核对安装和浏览器交互。

## 仓库目录

后端代码位于 `src/`，浏览器界面位于 `public/`，桌面入口位于 `desktop/`。辅助文档集中在 `docs/`，启动与构建脚本集中在 `scripts/`。在仓库根目录执行 `npm start`、`npm test` 和打包命令。直接启动可使用 `scripts/start.command`（macOS）、`scripts/start.bat`（Windows）或 `sh scripts/start.sh`。
