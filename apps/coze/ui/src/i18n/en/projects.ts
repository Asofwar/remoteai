// Apps, access links, backup, releases, shared app view and template gallery (WP4-coze-ui-projects).
export default {
  // projects/AccessPanel.tsx and SharedAppView.tsx: role labels (the role ids stay protocol values)
  "仅查看": "View only",
  "查看和使用": "View and use",
  "查看、使用和编辑": "View, use and edit",
  "可编辑": "Can edit",

  // projects/AccessPanel.tsx
  "复制未完成，请选中链接后复制。": "Couldn't copy the link. Select it and copy it manually.",
  "应用访问": "App access",
  "为这台电脑上的使用者创建访问链接。可分别设置权限，并随时停用。":
    "Create access links for people who use this computer. Each link has its own permissions, and you can revoke it at any time.",
  "发布应用后，即可创建访问链接。": "Publish the app to create access links.",
  "使用者或用途": "User or purpose",
  "天": "days",
  "创建链接": "Create link",
  "链接已创建，请复制保存。": "Link created. Copy it and keep it somewhere safe.",
  "应用访问链接": "App access link",
  "已复制": "Copied",
  "复制": "Copy",
  "暂无访问链接": "No access links yet",
  "已停用": "Revoked",
  "停用": "Revoke",
  "有效期至 {date}": "Valid until {date}",

  // projects/AppEditor.tsx
  "应用内容": "App content",
  "将智能体、工作流与资料组合成一个可以发布的应用。": "Combine agents, workflows and data into an app you can publish.",
  "选择应用使用的内容": "Choose the content this app uses",
  "应用入口": "App entry point",
  "选择智能体或工作流": "Choose an agent or workflow",
  "发布前，请先发布应用引用的内容。发布后会固定这些内容的版本，知识库资料和表中数据可继续更新。":
    "Publish the content this app uses before you publish the app. Publishing pins the versions of that content; knowledge base documents and table data can still be updated.",
  "版本 {revision}": "Version {revision}",
  "待发布": "Not published",
  "试运行": "Test run",

  // projects/BackupButton.tsx
  "备份操作未完成，请稍后重试。": "Couldn't complete the backup operation. Try again later.",
  "用备份替换当前内容？": "Replace your current content with the backup?",
  "当前内容会被替换，分享链接会失效。建议先下载一份备份。":
    "Your current content will be replaced, and access links will stop working. We recommend downloading a backup first.",
  "恢复备份": "Restore backup",
  "备份与恢复": "Backup and restore",
  "保存一份完整备份，随时恢复你的创作内容。": "Save a full backup so you can restore your work at any time.",
  "下载备份": "Download backup",
  "包含应用、文档、对话、发布版本和运行记录。": "Includes apps, documents, conversations, published versions and run history.",
  "下载完整备份": "Download full backup",
  "选择备份文件，恢复后将替换当前内容。": "Choose a backup file. Restoring it replaces your current content.",
  "选择备份文件": "Choose backup file",

  // projects/ReleaseHistory.tsx
  "发布后可在这里切换版本": "After you publish, you can switch versions here",
  "当前使用": "In use",
  "切换到版本 {revision}？草稿会保留。": "Switch to version {revision}? Your draft will be kept.",
  "使用此版本": "Use this version",
  "版本 {revision} · {date}": "Version {revision} · {date}",

  // projects/SharedAppView.tsx
  "应用暂不可用，请联系分享者。": "This app isn't available right now. Contact the person who shared it.",
  "欢迎使用这个应用。": "Welcome to this app.",
  "共享访问": "Shared access",
  "编辑": "Edit",
  "已加入此应用": "Part of this app",

  // projects/SharedWorkflow.tsx
  // Sample input value, localized once when the panel opens (the field name "text" stays).
  "你好": "Hello",
  "请填写一组完整的输入内容。": "Enter a complete set of inputs.",
  "使用应用": "Use the app",
  "工作流预览": "Workflow preview",
  "我的运行记录": "My runs",
  "运行记录": "Run history",
  "{date} · 等待回复": "{date} · Waiting for a reply",
  "填写应用需要的输入内容，然后开始运行。": "Enter the input the app needs, then start the run.",
  "应用输入": "App input",
  "运行": "Run",

  // projects/TemplateLibrary.tsx
  "请选择不超过 4 MB 的模板文件。": "Choose a template file of 4 MB or less.",
  "模板广场": "Template gallery",
  "从模板开始，让想法更快成形。": "Start from a template and bring your ideas to life faster.",
  "模板包含可复用的配置，不包含私有文档和对话。": "Templates include reusable settings, but not private documents or conversations.",
  "导入模板": "Import template",
  "还没有模板": "No templates yet",
  "内置模板": "Built-in template",
  "自定义模板": "Custom template",
  "使用模板": "Use template",
  "从模板广场移除？已创建的内容会保留。": "Remove from the template gallery? Content you already created from it will be kept.",
  "移除": "Remove",
} satisfies Record<string, string>;
