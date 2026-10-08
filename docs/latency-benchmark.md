# ReplyMate 首字延迟小样本实测

测试时间：2026-10-08 15:38–15:39（Asia/Shanghai）。

20 个不同英文问题中，14 个（70%）至少一版英文答案在请求发出后 3 秒内开始返回，18 个（90%）在 5 秒内开始返回。两版答案取较快者的首字延迟中位数为 2.59 秒。

| 口径 | 3 秒内 | 5 秒内 | 首字中位数 |
| --- | --- | --- | --- |
| 任一英文答案开始返回 | 14/20（70%） | 18/20（90%） | 2.59 秒 |
| 快速回答栏 | 9/20（45%） | 17/20（85%） | 3.30 秒 |
| 第二回答栏 | 8/20（40%） | 18/20（90%） | 3.11 秒 |

## 可用项目文案

> 本地 20 题小样本实测：70% 的问题在请求发出后 3 秒内开始返回至少一版 AI 英文答案，90% 在 5 秒内开始返回。

需随文保留条件：v2.4.0 源码、gpt-6.1-sol / low、简短英文示例资料、双回答与翻译并发。不包含语音识别、断句、用户排队与浏览器绘制时间。不代表所有用户、题型或网络条件下的达标率。

## 方法与边界

- 使用当前真实 `/api/answer` 与 `/api/translate`，关闭预设答案捷径，不使用离线演示生成。参考资料虽然名为 demo-1，回答来自真实模型。
- 每题同时启动第二回答、中文翻译、快速回答三个请求。以客户端收到首个非空白答案增量为首字，翻译不计入答案。任一答案口径取两个答案各自请求首字耗时的较小值。
- 20 题顺序执行，每题全部请求完成后再测下一题。没有额外预热，不删除首次、会话重建、慢请求或失败。60 个请求全部完成，完成率不等于答案正确率。
- 固定问题集覆盖项目用途、数据输入、隐私、局限、证据边界及部署追问。资料是项目内置的简短虚构能源看板示例，不能外推到长篇科研资料。问题集见 [questions.json](benchmarks/2026-10-08/questions.json)，全部回答与逐请求记录见 [results.json](benchmarks/2026-10-08/results.json)。
- 首题快速回答 7.485 秒，第 13 题 7.470 秒。代码每 12 次回答后清除会话，因此第 13 题与会话重建时点一致，尚未用对照实验确定慢响应原因。
- 本轮测量源码服务 API，没有进行浏览器显示或真实麦克风测试。测试使用本机 Codex CLI 0.162.0-alpha.2，安装包依赖声明为 0.161.0，不能直接称为安装包性能实测。
- 环境：macOS arm64，Node v26.5.0；源码提交 08744115d4edcda8c958064e62326e0f0e5a0446。测试前 Git 工作区无修改。网络与账号为本机当时条件，未单独测量网络延迟。
- 样本量只有 20 题，每一题对应 5 个百分点。70% 的 Wilson 95% 区间约为 48%–85%，且该区间不能消除选题偏差。适合标注为初步测试，暂不适合作为无条件性能承诺。

## 逐题结果

| 题号 | 快速回答（ms） | 第二回答（ms） | 任一答案 ≤3 秒 |
| --- | --- | --- | --- |
| 1 | 7485 | 7849 | 否 |
| 2 | 3312 | 2858 | 是 |
| 3 | 1932 | 3994 | 是 |
| 4 | 2374 | 4714 | 是 |
| 5 | 2761 | 3371 | 是 |
| 6 | 2950 | 3557 | 是 |
| 7 | 3423 | 4012 | 否 |
| 8 | 3290 | 3107 | 否 |
| 9 | 2440 | 3484 | 是 |
| 10 | 3425 | 3116 | 否 |
| 11 | 4359 | 2235 | 是 |
| 12 | 2476 | 2478 | 是 |
| 13 | 7470 | 7039 | 否 |
| 14 | 5744 | 3379 | 否 |
| 15 | 3574 | 2340 | 是 |
| 16 | 2695 | 3056 | 是 |
| 17 | 3390 | 2367 | 是 |
| 18 | 2217 | 1921 | 是 |
| 19 | 3730 | 2391 | 是 |
| 20 | 2410 | 1888 | 是 |

## English summary

In this local 20-question pilot, 70% (14/20) of questions began receiving at least one AI English answer within 3 seconds of request dispatch, and 90% (18/20) within 5 seconds. Median latency to the first of the two answers was 2.59 seconds. The fast-answer lane alone met the 3-second threshold for 45% (9/20).

Tested on 2026-10-08 with the v2.4.0 source service, gpt-6.1-sol / low, macOS arm64 and short fictional English reference material. Each question ran two answer requests and one translation concurrently; questions were sequential, with no explicit warm-up or prepared answers. All 60 requests completed. The timer stops at the first non-whitespace answer delta received by the HTTP client; translations do not count as answers. Speech recognition, utterance detection, user queues and browser painting are excluded. Codex CLI was 0.162.0-alpha.2, whereas the desktop package declares 0.161.0, so this is not an installer benchmark. The small, selected sample does not establish a universal success rate or answer accuracy.
