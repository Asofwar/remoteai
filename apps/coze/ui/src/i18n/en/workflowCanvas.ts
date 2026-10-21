// Workflow canvas, canvas controls, connections, run results and workflow editor (WP6-coze-ui-workflow-canvas).
export default {
  // workflow/graphEditing.ts: connection checks, shown by Canvas.tsx and ConnectionEditor.tsx
  "请连接画布中的节点。": "Connect nodes that are on the canvas.",
  "不能连接节点自身。": "A node can't connect to itself.",
  "请从输出端口连接到输入端口。": "Connect an output port to an input port.",
  "请选择条件分支。": "Choose a condition branch.",
  "这两个端口已经连接。": "These ports are already connected.",
  "连线数量已达到上限。": "You've reached the maximum number of connections.",
  "这条连线会形成回路，请使用循环节点。": "This connection would create a cycle. Use a loop node instead.",

  // workflow/flowAdapter.ts: condition edge labels on the canvas
  "成立": "True",
  "不成立": "False",

  // workflow/Canvas.tsx
  "节点数量已达到上限。": "You've reached the maximum number of nodes.",
  // Name of a duplicated node; stored as user data when the copy is made.
  "{name} 副本": "{name} copy",
  "工作流画布": "Workflow canvas",
  "复制节点": "Duplicate node",
  "删除所选": "Delete selected",
  "删除连线": "Delete connections",
  "已选中 {count} 条连线 · Delete 删除": "Connections selected: {count} · Press Delete to remove",
  "拖拽圆点连线 · 滚轮缩放 · Shift 框选": "Drag a dot to connect · Scroll to zoom · Shift to select an area",

  // workflow/CanvasControls.tsx
  "撤销 (Ctrl+Z)": "Undo (Ctrl+Z)",
  "重做 (Ctrl+Shift+Z)": "Redo (Ctrl+Shift+Z)",
  "缩小": "Zoom out",
  "放大": "Zoom in",
  "适应画布": "Fit to screen",
  "自动整理": "Auto-arrange",
  "重置缩放": "Reset zoom",

  // workflow/ConnectionEditor.tsx and WorkflowNode.tsx
  "连接到下一步": "Connect to the next step",
  "也可以拖拽画布上的圆点连接节点。": "You can also drag the dots on the canvas to connect nodes.",
  "条件成立": "If true",
  "条件不成立": "If false",
  "选择要连接的节点": "Choose a node to connect to",
  "连接": "Connect",
  "移除→ {target}": "Remove connection → {target}",
  "移除成立分支→ {target}": "Remove true branch → {target}",
  "移除不成立分支→ {target}": "Remove false branch → {target}",

  // workflow/WorkflowNode.tsx
  "工作流的输入": "Workflow input",
  "请选择模型": "Choose a model",
  "已选择 {count} 个知识库": "Knowledge bases selected: {count}",
  "{name} 输入端口": "{name} input port",
  "{name} 输出端口": "{name} output port",
  "{name} 条件成立端口": "{name} true branch port",
  "{name} 条件不成立端口": "{name} false branch port",

  // workflow/RunResult.tsx: run status labels (the status ids stay protocol values)
  "已完成": "Completed",
  "等待回复": "Waiting for a reply",
  "运行中": "Running",
  "失败": "Failed",
  "已停止": "Stopped",
  "已中断": "Interrupted",
  "运行结果": "Run result",
  "节点详情": "Node details",
  "回答": "Answer",
  "{field}（必填）": "{field} (required)",
  "补充信息": "Additional information",
  "请检查填写的内容。": "Check what you entered.",
  "继续运行": "Continue run",
  "可以稍后在运行记录中继续，已完成的步骤会保留。": "You can continue later from Run history. Completed steps are kept.",

  // workflow/useWorkflowExecution.ts sets "运行已停止。", the Rust Error::Cancelled text: see runtime.ts.

  // workflow/WorkflowEditor.tsx
  // Sample test-run input value, localized once when the editor opens (the field name "text" stays).
  "你好": "Hello",
  "请填写有效的 JSON 输入。": "Enter valid JSON input.",
  "文件过大，请选择较小的工作流。": "The file is too large. Choose a smaller workflow.",
  "文件内容无法读取，请检查后重试。": "Couldn't read the file. Check it and try again.",
  "导入画布": "Import canvas",
  "运行记录": "Run history",
  "试运行": "Test run",
  "画布已导入，请检查所用模型和输入内容后保存。": "Canvas imported. Check the models and inputs it uses, then save.",
  "填写工作流的输入内容。": "Enter the workflow input.",
  "工作流输入": "Workflow input",
  "开始运行": "Start run",
  "正在运行…": "Running…",
} satisfies Record<string, string>;
