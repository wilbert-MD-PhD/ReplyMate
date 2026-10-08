# ReplyMate 2.5.2 · 故障恢复与多页面修复

修复 v2.5.0 审查确认的三个功能问题：

- **AI 断线后可直接重连**：页面轮询同步连接状态、账号状态和错误信息，AI 子进程退出后撤销“预热完成”，显示“重新连接”。重连保留当前页面已有问答。
- **设置保存保持一致**：完整设置操作提前获取互斥锁，重叠请求明确返回 HTTP 409。校验、运行时切换、落盘和失败回退均在锁内执行，临时文件使用唯一名称，同一路径的原子写入串行执行，避免 Windows 并发重命名冲突。
- **多页面独立答题**：每页拥有独立的快速回答、深度回答和翻译会话，不再因另一页面正常答题而收到错误 429。首页接用启动预热，其他页面分别预热。同页同通道的重叠请求仍受限制。

同步修正首页下载版本及 AI、Office、PDF 组件按需安装说明。已有账号、资料与设置沿用原目录。

## 下载

- [macOS Apple 芯片](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.2/ReplyMate-2.5.2-macOS-arm64.dmg)
- [macOS Intel](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.2/ReplyMate-2.5.2-macOS-x64.dmg)
- [Windows x64](https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v2.5.2/ReplyMate-2.5.2-Windows-x64-Setup.exe)

可选组件与主程序同批构建，软件内可在线安装或导入对应平台的 `.tar.br` 附件。校验值见 `SHA256SUMS.txt`。

## 验证范围

新增回归覆盖：模拟 AI 子进程崩溃与重连、预热失效、慢请求体下的设置互斥、保存失败回退、两页面三通道隔离、同页互斥及连续问答的线程延续。故障恢复测试使用隔离的模拟 Codex 进程，不调用真实模型服务。

本版保留未签名／未公证的分发状态。真实账号网络故障、真实麦克风和各语种语音质量不属于本次三项修复的验证范围。
