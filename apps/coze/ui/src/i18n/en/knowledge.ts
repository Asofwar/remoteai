// Knowledge import and panel, tables, HTTP tool editor (WP3-coze-ui-knowledge-tables-tools).
// Shared words such as "取消" and "删除" come from core.ts.
export default {
  // knowledge/useKnowledgeJob.ts: import progress, translated when rendered
  "正在准备导入": "Preparing import…",
  "正在读取文档": "Reading document…",
  "正在读取网页": "Reading web page…",
  "正在识别内容": "Recognizing content…",
  "正在整理知识": "Indexing knowledge…",
  "正在处理": "Processing…",
  "{stage}（{completed} / {total}）": "{stage} ({completed} / {total})",
  "导入完成": "Import complete",
  "已取消导入": "Import canceled",
  "正在取消导入": "Canceling import…",
  "导入未完成，请重试。": "Couldn't complete the import. Try again.",
  "上次导入已结束或连接已重启，请检查文档列表。":
    "The last import has already ended or the connection restarted. Check the document list.",

  // knowledge/DocumentSource.tsx
  "网页": "Web page",
  "查看来源": "View source",
  "更新网页内容": "Update page content",
  "图片": "Image",
  "扫描 PDF": "Scanned PDF",
  "查看原图": "View original image",

  // knowledge/KnowledgeImport.tsx
  "请选择不超过 32 MB 的文件。": "Choose a file of 32 MB or less.",
  "请先选择支持图片识别的模型。": "Choose a model that supports image recognition first.",
  "请选择不超过 16 MB 的图片。": "Choose an image of 16 MB or less.",
  "文件与图片": "Files and images",
  "图片识别模型": "Image recognition model",
  "识别图片时，请选择支持图片的模型": "To recognize images, choose a model that supports them",
  "识别扫描 PDF 中的文字": "Recognize text in scanned PDFs",
  "正在整理内容，请稍候…": "Processing content. Please wait…",
  "拖放文件到这里，或点击选择": "Drop a file here or click to choose one",
  "文档最大 32 MB，图片最大 16 MB；扫描 PDF 最多 50 页。":
    "Documents up to 32 MB, images up to 16 MB, scanned PDFs up to 50 pages.",
  "图片和扫描件将交给所选模型识别，完成后可以查看并修正分段内容。":
    "The selected model recognizes images and scans. Then you can review and correct the chunks.",
  "网页地址": "Web page URL",
  "导入网页": "Import web page",
  "导入公开网页中的文字。需要登录或只能在浏览器中加载的内容，请另存为文件后导入。":
    "Imports text from public web pages. For content that requires sign-in or only loads in a browser, save it as a file and import the file.",

  // knowledge/KnowledgePanel.tsx
  "文档": "Documents",
  "导入文件后自动整理知识，在智能体和工作流中引用。":
    "Imported files are turned into knowledge automatically. Use it in agents and workflows.",
  "分段字数": "Chunk size (characters)",
  "重叠字数": "Overlap (characters)",
  "取消导入": "Cancel import",
  "还没有文档": "No documents yet",
  "查看分段": "View chunks",
  "删除此文档和它的全部分段？": "Delete this document and all its chunks?",
  "删除 {name}": "Delete {name}",
  "{chunks} 个分段 · {size} KB": "Chunks: {chunks} · {size} KB",
  "检索测试": "Retrieval test",
  "输入问题，查看知识库能够找到的内容。": "Enter a question to see what the knowledge base can find.",
  "试着问一个问题": "Try asking a question",
  "检索": "Search",
  "检索结果将显示在这里": "Search results will appear here",
  "分段 {index}": "Chunk {index}",
  "保存分段": "Save chunk",
  "编辑分段": "Edit chunk",

  // TableEditor.tsx
  "请填写有效的 JSON 对象。": "Enter a valid JSON object.",
  "请选择不超过 32 MB 的表格。": "Choose a spreadsheet file of 32 MB or less.",
  "数据记录": "Records",
  "已导入 {imported} 条记录。": "Records imported: {imported}.",
  "记录内容": "Record content",
  "保存记录": "Save record",
  "新增记录": "Add record",
  "导入表格": "Import spreadsheet",
  "表格首行作为字段名称，Excel 导入第一个工作表，每次最多 10,000 条记录。":
    "The first row is used as field names. From Excel files, the first sheet is imported. Up to 10,000 records per import.",
  "编辑": "Edit",
  "确定删除这条记录？": "Delete this record?",
  "共 {count} 条记录": "Total records: {count}",
  "字段设置": "Field settings",
  "查询与分析": "Queries and analysis",

  // tables/TableSchemaEditor.tsx
  "文本": "Text",
  "整数": "Integer",
  "数字": "Number",
  "是 / 否": "Yes / No",
  "日期时间": "Date and time",
  "对象或数组": "Object or array",
  "设置字段后，新记录和已有记录都需要符合字段要求。留空可继续自由填写记录。":
    "Once fields are set, new and existing records must match them. Leave this empty to keep records free-form.",
  "字段设置已保存。": "Field settings saved.",
  "字段 {index} 名称": "Field {index} name",
  "字段名称": "Field name",
  "字段 {index} 类型": "Field {index} type",
  "必填": "Required",
  "移除": "Remove",
  "添加字段": "Add field",
  "保存字段设置": "Save field settings",
  "日期时间请填写为带时区的完整时间，例如 2026-10-11T09:00:00+08:00。":
    "Enter dates and times in full with a time zone, for example 2026-10-11T09:00:00+08:00.",

  // tables/TableSqlPanel.tsx
  "选择要查询的数据表，可直接编写 SQL，也可让模型根据问题生成查询。":
    "Choose the tables to query. Write SQL yourself or let a model generate a query from your question.",
  "查询的数据表": "Tables to query",
  "；": "; ",
  "查询生成模型": "Query generation model",
  "选择用于理解问题的模型": "Choose a model to interpret the question",
  "数据问题": "Question about the data",
  "例如：按城市统计本月销售额，从高到低排列": "For example: this month's sales by city, highest first",
  "生成查询": "Generate query",
  "SQL 查询": "SQL query",
  "运行查询": "Run query",
  "查询不会修改记录。生成后请先检查字段和筛选条件，再运行。":
    "Queries don't change records. After generating a query, check its fields and filters before you run it.",
  "已显示前 1,000 条结果，请缩小查询范围以查看其余内容。":
    "Showing the first 1,000 results. Narrow the query to see the rest.",

  // ToolEditor.tsx
  "请填写有效的 JSON。": "Enter valid JSON.",
  "HTTP 工具": "HTTP tool",
  "连接公开的 HTTPS 服务，可在工作流中使用，也可发布给 Codex GUI。":
    "Connects to a public HTTPS service. Use it in workflows or publish it to Codex GUI.",
  "请求地址": "Request URL",
  "可用 {example} 引用调用参数。": "Use {example} to reference call parameters.",
  "{{input.字段名}}": "{{input.field_name}}",
  "请求方式": "Request method",
  "请求内容": "Request body",
  "请求内容需要是有效的 JSON。": "The request body must be valid JSON.",
  "工具测试": "Tool test",
  "调用参数": "Call parameters",
  "运行测试": "Run test",
} satisfies Record<string, string>;
