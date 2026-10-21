// Agent chat preview and settings, external access panel (WP2-coze-ui-agents-external).
export default {
  // agents/AgentPreview.tsx
  "对话预览": "Chat preview",
  "历史对话": "Chat history",
  "新对话": "New chat",
  "发一条消息，试试它的表现": "Send a message to see how it responds",
  "工具返回结果": "Tool result",
  "你": "You",
  "本轮工具调用（{count}）": "Tool calls this turn ({count})",
  "调用中": "Running",
  "已返回": "Returned",
  "正在回答": "Answering",
  "正在回答 · 第 {step} 轮": "Answering · round {step}",
  "正在准备…": "Preparing…",
  "输入消息…": "Type a message…",
  "发送": "Send",

  // agents/AgentSettings.tsx
  "角色与能力": "Role and capabilities",
  "模型": "Model",
  "选择 Remote AI 的模型": "Choose a Remote AI model",
  "刷新": "Refresh",
  "角色提示词": "System prompt",
  "描述它的角色、任务和回答方式…": "Describe its role, tasks and how it should answer…",
  "从提示词库插入": "Insert from prompts",
  "回答前参考的知识库": "Knowledge bases to check before answering",
  "选择知识库": "Choose knowledge bases",
  "可自主调用的工具": "Tools it can call on its own",
  "选择已发布的工作流、工具或资料": "Choose published workflows, tools or data",
  "{name}（未发布）": "{name} (not published)",
  "允许修改的数据表": "Tables it can change",
  "默认仅允许查询": "Read-only by default",
  "最多调用轮数": "Max tool-call rounds",
  "记住最近对话轮数": "Recent turns to remember",
  "回答创造性": "Response creativity",

  // agents/useAgentChat.ts
  "已停止生成。": "Generation stopped.",
  "回答未完成，请重试。": "Couldn't finish the answer. Try again.",

  // external/ConnectionExamples.tsx (sample values go into the generated request)
  "你好": "Hello",
  "要查询的问题": "Your question",
  "复制配置": "Copy configuration",
  "连接地址": "Connection address",
  "本机": "This computer",
  "其他电脑": "Other computers",
  "将示例中的 YOUR_TOOL_KEY 替换为你保存的调用密钥。": "Replace YOUR_TOOL_KEY in the examples with the access key you saved.",
  "MCP 客户端": "MCP client",
  "添加 HTTP 类型的 MCP 服务，填写地址与 Authorization 请求头。支持 JSON 配置的客户端可参考：":
    "Add an HTTP MCP server with this address and the Authorization header. For clients that accept a JSON configuration:",
  "此密钥会自动选择“{name}”。请按已发布内容的输入要求填写参数。":
    "This key automatically selects “{name}”. Fill in the parameters that the published content expects.",
  "工作流使用 input，智能体使用 message，知识库使用 query。":
    "Workflows use input, agents use message, and knowledge bases use query.",
  "暂停等待回答时，将 run_id、interaction_id 和 input 发送到 /api/resume 即可继续。":
    "When a run pauses for an answer, send run_id, interaction_id and input to /api/resume to continue.",

  // external/ExternalToolsPanel.tsx
  "外部调用": "External access",
  "让其他应用通过 MCP 或 API 使用这项内容。先发布，再创建专用密钥。":
    "Let other apps use this content through MCP or the API. Publish it first, then create a dedicated key.",
  "在 Codex GUI 中输入 {mention} 并选择，即可在对话中调用。": "Type {mention} in Codex GUI and select it to use it in a chat.",
  "连接范围": "Connection scope",
  "此设置适用于本机所有已开放的 Coze 内容。关闭后会暂停全部外部调用。":
    "This setting applies to all Coze content shared from this computer. Turning it off pauses all external access.",
  "仅本机应用": "Apps on this computer only",
  "允许其他电脑": "Allow other computers",
  "调用端口": "Access port",
  "端口": "Port",
  "暂停全部外部调用？": "Pause all external access?",
  "关闭外部调用": "Turn off external access",
  "开启外部调用": "Turn on external access",
  "其他电脑需能连接此电脑的地址和端口，并在防火墙中放行。 跨公网使用时，请通过 VPN 或 HTTPS 网关连接。":
    "Other computers must be able to reach this computer's address and port, and the firewall must allow it. Over the internet, connect through a VPN or an HTTPS gateway.",
  "调用密钥": "Access keys",
  "请先发布此内容，再创建调用密钥。": "Publish this content before you create an access key.",
  "密钥用途": "Key purpose",
  "应用名称或用途": "App name or purpose",
  "密钥有效天数": "Key validity in days",
  "天": "days",
  "创建密钥": "Create key",
  "密钥仅显示这一次，请复制保存。": "This key is shown only once. Copy and save it.",
  "暂无调用密钥": "No access keys yet",
  "已停用": "Revoked",
  "停用": "Revoke",
  "已过期": "Expired",
  "有效期至 {date}": "Valid until {date}",
} satisfies Record<string, string>;
