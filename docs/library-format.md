# 自定义资料与预设问答

最快的方法是 `npm run import -- "./notes.md"`。需要预设问答时，复制
`examples/reference.json` 到本机 `user-data/my-library.json`，修改后导入。
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

每次重新导入会验证格式并备份旧资料。服务运行期间保持当前知识库快照，重启后切换到新资料。
工具只能检查结构和来源 ID，无法替代人工核对事实。资料更新后请重新核对相关预设。
