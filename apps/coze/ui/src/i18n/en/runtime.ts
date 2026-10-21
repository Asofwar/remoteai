// Messages written by the Rust runtime (apps/coze/src) that the editor shows, keyed by the
// exact Chinese text. Render them with t(error). runtime.test.ts reads the Rust sources and
// fails when a message changes or is added without a translation (WP8-coze-ui-runtime-dictionary).
// The pattern `暂时无法导入此节点：{reason}。` lives in core.ts next to PATTERNS in i18n/index.ts.
export default {
  // error.rs: Display texts returned by /api, job.error and /backup, also stored in runs.error.
  "运行已停止。": "Run stopped.",
  "请先发布应用引用的内容，再重试。": "Publish the content this app uses, then try again.",
  "仍有已发布内容引用此项，请先移除对应发布内容。": "Published content still uses this item. Remove that published content first.",
  "内容不完整或格式有误，请检查后重试。": "The content is incomplete or invalid. Check it and try again.",
  "内容已被其他页面修改，请刷新后重试。": "This content was changed on another page. Refresh and try again.",
  "未找到这项内容，它可能已被删除。": "This item wasn't found. It may have been deleted.",
  "暂时无法保存数据，请检查磁盘空间后重试。": "Couldn't save data right now. Check your disk space and try again.",
  "文件处理失败，请检查文件后重试。": "Couldn't process the file. Check the file and try again.",
  "文件格式暂不支持，请选择文档、表格或 PNG、JPG、WebP 图片。":
    "This file format isn't supported yet. Choose a document, a spreadsheet or a PNG, JPG or WebP image.",
  "没有找到可读取的内容。图片或扫描文件请使用图片与扫描件导入。":
    "No readable content was found. Import images and scanned files with image and scan recognition.",
  "本地知识库模型未准备好，请重新下载 Coze。": "The local knowledge base model isn't ready. Download Coze again.",
  "模型连接失败，请检查 Remote AI 中选择的账户或服务。":
    "Couldn't connect to the model. Check the account or service selected in Remote AI.",
  "工作流连线或节点配置有误，请检查后重试。": "A workflow connection or node setting is invalid. Check it and try again.",
  "运行已达到限制，请缩小输入或减少循环次数。": "The run reached a limit. Use a smaller input or fewer loop iterations.",
  "请先发布此内容，再通过 MCP 调用。": "Publish this content before you call it through MCP.",
  "连接已失效，请重新打开 Coze。": "The connection is no longer valid. Reopen Coze.",
  "外部请求未完成，请检查地址和服务状态。": "The external request didn't complete. Check the address and the service status.",
  "无法开启外部调用，请检查端口是否被占用。": "Couldn't turn on external access. Check whether the port is already in use.",

  // workflow/upstream.rs, workflow/upstream/values.rs: {reason} of `暂时无法导入此节点：{reason}。`.
  // Numeric upstream node type ids are shown as they are.
  "嵌套画布": "nested canvas",
  "代码语言": "code language",
  "未知类型": "unknown type",
  "大模型历史、工具或结构化输出": "LLM chat history, tools or structured output",
  "输入字段类型": "input field type",
  "多出口分支": "branch with multiple outputs",
  "变量表达式": "variable expression",
  "应用或系统变量": "app or system variables",

  // main.rs, workflow/checkpoint.rs: stored in runs.error when a run is interrupted.
  "上次运行已中断。": "The previous run was interrupted.",
  "运行已中断，请检查已完成的步骤后重新运行。": "The run was interrupted. Check the completed steps, then run it again.",

  // catalog.rs builtin_entries(): the built-in template in the template library list.
  "知识问答助手": "Knowledge Q&A assistant",
  "从资料库回答问题，附上可追溯的引用。选择模型并导入资料后即可使用。":
    "Answers questions from your knowledge base with traceable citations. Choose a model and import your materials to start.",
} satisfies Record<string, string>;
