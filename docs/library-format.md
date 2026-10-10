# 自定义资料与预设问答

## 文件导入与检索

支持多选或拖入多个文件，文件数量、原文件大小、提取文字总量与资料 JSON 大小不限额。TXT、Markdown 和资料 JSON 无需组件，DOCX／PPTX 与 PDF 需要先在组件中心安装对应解析组件。仅提取文字，不包含扫描文档 OCR、图表或公式解释。

普通文档自动取前 12,000 字符作为候选摘要，合并后供模型使用的总摘要仍限制在 24,000 字符，每次提问再检索最多三个相关片段。全文分段保存在资料库中，导入不限额不等于每次提问把全文发送给模型。大文件的实际处理能力取决于本机内存、磁盘及解析器。把概要、关键数据和常见问题放在资料前部，有助于提供上下文。

片段检索使用 Unicode 词分段与同语言词面匹配，支持中文等非拉丁文字，但不提供跨语言语义检索。命中长片段后，按问题关键词选取相关正文窗口，每个窗口最多 2,000 字符，连同来源标题合计最多 4,800 字符。问题与关键资料片段宜使用相同语言。参考摘要仍会进入 AI 提示，不能把“发送了摘要”等同于完整资料已被检索。

默认追加到资料库，也可选择替换整个资料库。追加保留已有资料和预设问答，首次导入不混入示例资料。多个文件先全部解析并校验，再一次性保存和备份旧库。任一文件失败或预设问法冲突时，整批不保存并提示原因。成功导入会清空当前页面问答，请先复制需要保留的回答。

## 预设问答 JSON

点击页面上方“选择资料”即可导入文档。需要预设问答时，复制
`examples/reference.json` 到本机 `user-data/my-library.json`，修改后通过页面导入。
不要直接把私人资料写入公开的 `examples/`。

```json
{
  "version": "my-presentation-1",
  "context": "Your verified summary. Include known limitations.",
  "terms": ["technical term"],
  "sources": [{"id": "slides", "name": "Presentation notes"}],
  "chunks": [{
    "id": "chunk-1", "sourceId": "slides", "source": "Presentation notes",
    "title": "Project purpose", "text": "Your source text."
  }],
  "faq": [{
    "id": "faq-1", "title": "Purpose", "question": "What is the purpose?",
    "questionZh": "目的是什么？", "answer": "Your checked English answer.",
    "aliases": ["What does the project do?"], "sourceIds": ["slides"],
    "reviewed": false
  }]
}
```

- `context`：最多 24,000 字符的摘要。资料不足时应写清限制。
- `chunks`：片段数量不限，各自不超过 6,000 字符，ID 唯一。
- `sources`：来源 ID 与显示名称。不要填写无需展示的私人路径。
- `faq`：条数不限。`reviewed: false` 不会出现在预设快答中。每条需有有效 `sourceIds`。
- `aliases`：逐条审核等义问法。数字、否定和复合提问必须分别处理。匹配保留正负号、小数点、比较符号和词间边界，只统一大小写、全半角、常见排版符号、空白及句末标点。规范化后的重复问法会被拒绝。
- `terms`：本地语音识别提示词数量不限，实际 Whisper 提示使用前 18 个去重词。

```sh
npm run import -- --append "./user-data/my-library.json" "./notes.md"
# 替换整个资料库
npm run import -- --replace "./notes.md" "./more.txt"
```

通过页面导入会验证格式、备份旧资料并立即应用。下方命令行方式供源码使用者使用，需重启服务后生效。
工具只能检查结构和来源 ID，无法替代人工核对事实。资料更新后请重新核对相关预设。
