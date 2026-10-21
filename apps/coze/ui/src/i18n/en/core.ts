// Studio shell, resource editor, API fallbacks and default content (WP1-coze-ui-core).
export default {
  // api.ts
  "操作未完成，请重试。": "Couldn't complete the action. Try again.",
  "文件未能读取，请重新选择。": "Couldn't read the file. Choose it again.",
  // Runtime message with an embedded reason (see PATTERNS in i18n/index.ts).
  "暂时无法导入此节点：{reason}。": "This node can't be imported yet: {reason}.",

  // Default content, localized once when a resource is created (types.ts).
  "要处理的文本": "Text to process",
  "开始": "Start",
  "文本处理": "Text processing",
  "结束": "End",
  "你是一位耐心、准确的助手。": "You are a patient and accurate assistant.",
  "名称": "Name",
  "内容": "Content",

  // Studio.tsx
  "放弃未保存的修改？": "Discard unsaved changes?",
  "放弃修改": "Discard changes",
  "继续编辑": "Keep editing",
  "请选择不超过 4 MB 的导出文件。": "Choose an export file of 4 MB or less.",
  "请选择从 Remote AI Coze 导出的文件。": "Choose a file exported from Remote AI Coze.",
  "文件中的内容类型暂不支持。": "The content type in this file isn't supported yet.",
  "Coze 导航": "Coze navigation",
  "你的 AI 创作空间": "Your AI studio",
  "创作空间": "Studio",
  "模板已创建，当前修改已保留。": "Created from the template. Your current changes are kept.",
  "让文件成为可检索、可引用的知识。": "Turn files into knowledge you can search and cite.",
  "从想法出发，创建可以反复使用的 AI 能力。": "Turn ideas into AI capabilities you can use again and again.",
  "导入": "Import",
  "搜索名称或描述": "Search by name or description",
  "添加描述，方便下次找到。": "Add a description so it's easier to find later.",
  "已接入 Codex GUI": "Connected to Codex GUI",
  "仅自己可见": "Only visible to you",
  "创建": "Create",
  "取消": "Cancel",
  "给它起个名字": "Give it a name",

  // ResourceEditor.tsx
  "请先修正标红的内容，再保存或运行。": "Fix the fields marked in red before you save or run.",
  "已发布，Codex GUI 现在可以调用了。": "Published. Codex GUI can use it now.",
  "返回": "Back",
  "描述": "Description",
  "描述用途，帮助你和 AI 更好地使用它": "Describe what it's for to help you and AI use it",
  "导出": "Export",
  "保存": "Save",
  "已保存": "Saved",
  "发布到 Codex GUI": "Publish to Codex GUI",
  "编辑与预览": "Edit and preview",
  "写下可反复使用的提示词…": "Write a prompt you can reuse…",
  "设置": "Settings",
  "用途描述": "Purpose",
  "保存为模板": "Save as template",
  "将当前配置和引用的内容一起放入模板广场，方便复用或导出分享。":
    "Add the current setup and the content it uses to the template gallery to reuse, export or share it.",
  "已保存到模板广场": "Saved to the template gallery",
  "保存到模板广场": "Save to template gallery",
  "发布状态": "Publishing status",
  "当前草稿版本：{revision}　已发布版本：{published}": "Draft version: {revision} · Published version: {published}",
  "当前草稿版本：{revision}　已发布版本：尚未发布": "Draft version: {revision} · Not published yet",
  "停止向 Codex GUI 提供": "Remove from Codex GUI",
  "删除内容": "Delete content",
  "删除后将同时移除相关文档、对话和运行记录。": "This also deletes related documents, conversations and run history.",
  "确定删除？此操作无法撤销。": "Delete? This can't be undone.",
  "删除": "Delete",

  // StopCozeButton.tsx
  "停止 Coze？已保存的内容会保留。": "Stop Coze? Your saved content will be kept.",
  "停止": "Stop",
  "停止 Coze": "Stop Coze",
  "正在停止…": "Stopping…",
} satisfies Record<string, string>;
