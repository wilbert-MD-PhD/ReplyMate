# 自定义资料与预设问答

## 文件导入与检索

每次导入一份文件，原文件最大 20 MB。TXT、Markdown 和资料 JSON 无需组件，DOCX／PPTX 与 PDF 需要先在组件中心安装对应解析组件。仅提取文字，不包含扫描文档 OCR、图表或公式解释。

提取后的文字最大 1 MB，资料 JSON 最大 5 MB。普通文档自动取前 12,000 字符作为摘要，每次提问再检索最多三个相关片段。把概要、关键数据和常见问题放在资料前部，有助于提供上下文。

片段检索使用 Unicode 词分段与同语言词面匹配，支持中文等非拉丁文字，但不提供跨语言语义检索。问题与关键资料片段宜使用相同语言。参考摘要仍会进入 AI 提示，不能把“发送了摘要”等同于完整资料已被检索。

更换资料会备份旧资料并清空当前页面问答，请先复制需要保留的回答。普通文档导入后会清空示例预设，失败的导入保留现有资料。

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
- `chunks`：最多 2,000 个片段，各自不超过 6,000 字符，ID 唯一。
- `sources`：来源 ID 与显示名称。不要填写无需展示的私人路径。
- `faq`：最多 1,000 条。`reviewed: false` 不会出现在预设快答中。每条需有有效 `sourceIds`。
- `aliases`：逐条审核等义问法。数字、否定和复合提问必须分别处理。规范化后的重复问法会被拒绝。
- `terms`：最多 100 个本地语音识别提示词，实际 Whisper 提示使用前 18 个去重词。

```sh
npm run import -- "./user-data/my-library.json"
```

通过页面导入会验证格式、备份旧资料并立即应用。下方命令行方式供源码使用者使用，需重启服务后生效。
工具只能检查结构和来源 ID，无法替代人工核对事实。资料更新后请重新核对相关预设。
