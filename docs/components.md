# 组件开发与验收

## 开发运行

要求 Node.js 22.13 或更新版本。执行 `npm ci --ignore-scripts`。主程序 `npm start` 默认运行演示，不需要生产依赖。

测试解析插件前，分别执行 `npm ci --ignore-scripts --prefix plugins/docs-office` 和 `npm ci --ignore-scripts --prefix plugins/docs-pdf`。插件各自保有依赖锁，不从主程序裸包名加载。`npm test` 包含原有模型策略、独立回答、文本和录音流程，以及新增安装事务、多语言、预热回归。

## 构建顺序

1. `node node_modules/electron/install.js` 安装构建用 Electron。
2. `npm run whisper:build` 使用 CMake 构建固定 commit 的 whisper-server。服务器补丁拒绝浏览器 Origin 和非回环 Host，嵌入 Metal 资源，CPU 构建不假设当前机器指令集。
3. `npm run desktop:prepare` 构建本平台独立组件并写入带精确字节数与哈希的内置目录，然后生成 `build/core`。
4. `npx --no-install electron-builder --publish never` 构建主程序。
5. `npm run desktop:audit` 检查 ASAR 内容。`node scripts/smoke-desktop.mjs` 从外部运行真实安装包的干净启动测试。

组件附件在 `dist/components`，安装包在 `dist/desktop`。核心清单不含开发依赖、测试脚本、账户、录音或私人资料。原样保留必要第三方许可证。

## 数据与安装边界

桌面沿用 appId `org.replymate.desktop` 与 Electron `userData`。账号仍在 `account`，参考资料仍在 `data`。新增 `components`、`models`、`downloads`、`settings.json`、`component-state.json`。组件卸载只删除所属组件目录，不删除账号与资料。退出账号使用原有独立入口。

运行组件为受限 USTAR gzip 归档，仅接受普通文件和目录，拒绝绝对路径、父目录、链接、特殊文件、重复路径和超额解包。模型为原始 ggml 文件。浏览器只传组件 ID 或上传文件，不能指定下载 URL 或可执行路径。固定目录随核心发布，不提供未验证的远端目录替换接口。

下载续传同时检查 URL、哈希、ETag 和 Content-Range。HTTP 200 会重写半包，不能追加完整响应。先校验、自检和落盘，再原子更新状态。一个安装锁限制同一用户目录并发写入。进程崩溃后的未完成下载显示可恢复状态，未完成目录不参与运行解析。

## 语音与性能范围

前后端共享加载、排队、识别与总请求预算，队列最多 3 段。前端在积压时暂停并保留最后片段供重试。推理取消采用停止并重建工作进程，避免仅断开 HTTP 连接后仍持续计算。切换模型前必须停止收音并等待在途任务完成，加载失败恢复旧配置。

模型目录有 7 个独立 SHA-256。旧多语言权重不提供粤语，Turbo 提供；英语专用版只支持 `en`。引擎请求固定 `translate=false`、`carry_initial_prompt=false`，重复输出去掉术语提示后仅重试一次。语言是内容语言，印度口音英文仍选英语。`avg_logprob` 不作为校准后的准确率。

检索现支持 Unicode 词分段和同语言词面匹配，不具备跨语言语义检索。中文问题配英文资料时，完整参考摘要仍进入云端提示，但词面检索召回需单独验证。

`node scripts/verify-local-components.mjs` 在 `dist/qa` 的独立数据目录校验同批组件并下载七种模型。需先把上游固定 commit 的公开 `samples/jfk.wav` 保存到 `dist/qa/jfk.wav`。该脚本使用公开英文音频和静音做装载与转写测试，不等同真实麦克风、各语言准确率或长期运行测试。
