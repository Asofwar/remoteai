# Remote AI 官网

React 18 + Ant Design 5 + Vite 的静态多页官网。源码位于 `apps/website`，
与桌面端、远程 Web 应用和 admin-go 分开构建。

## 页面与内容

- 中文、英文和俄文各 16 页，共 48 个可直接访问的页面。中文位于根路径，英文和俄文分别位于 `en/` 和 `ru/`。
- 首页、功能总览、下载页、快速上手指南、AI 资源页。
- 11 个独立功能页：Codex GUI、跨设备工作区、会话管理、多账号管理、
  Provider 与本地代理、Token 分析、Skills 与插件、电脑助手、
  Dream Skin、2FA、悬浮用量球。
- 每个功能页包含配图、适用场景、三组详细说明、操作步骤、使用条件、
  常见问题、相关功能和仓库资料链接。
- 功能文案位于 `src/content/features-*.ts`，通用文案位于 `src/content/copy.ts`。
  修改功能时同步维护中文和英文，核对该条目 `source` 指向的项目文档。
- 俄文文案单独存放：通用文案在 `src/content/copy-ru.ts`，功能文案按 slug 存放在
  `src/content/features-ru.ts`。俄文缺失的条目在页面中显示英文，构建时输出警告，不会阻止发布。
- 导航、示意图和页面元信息中的短文案集中在 `src/lib/ui-text.ts`，每条包含中文、英文和俄文。

配图复用 `docs/assets/codex-switch-*.png` 中的产品截图。构建时由 Sharp 生成
WebP 和窄屏版本；小尺寸图片不会放大。跨设备和电脑助手使用代码绘制的流程示意，
并在页面中标明“功能流程示意”。不包含真实用户的新录屏、凭据或虚构使用量。

## 外观与首页展示

官网默认使用纯白主题，导航栏的太阳 / 月亮按钮可切换深色主题。
选择保存在 `remoteai-website-theme`，跨页面和语言保持一致，并同步到其他打开的标签页。
`index.html` 在页面绘制前读取偏好；存储不可用时仍可切换当前页面，禁用 JavaScript 时默认纯白。
颜色集中在 `src/styles/theme.css`，页面和流程示意共用语义颜色变量。

首页借鉴 Storybook 的标题、光晕和产品展示布局，保留 Remote AI 的品牌、内容与实际截图。
`HomeShowcase` 提供四个产品预览，支持点击及方向键、Home / End 键切换；
`HomeStories` 从已有功能资料组织图文介绍，详情页仍是完整的静态 HTML。

## 本地开发与检查

在仓库根目录运行：

```sh
npm ci --workspace @codex-switch/website --include-workspace-root=false --ignore-scripts
npm run dev:website
npm run check:website
npm run test:website:e2e
```

开发地址默认是 `http://127.0.0.1:4175/remoteai/`。

`check:website` 执行 TypeScript 检查、图片优化、客户端构建、React 静态渲染和
导出验证。`test:website:e2e` 使用生产产物检查全部页面的 hydration、图片、
导航、语言切换、手机布局与禁用 JavaScript 的访问，并保留黑白主题的视觉检查截图。
外观测试还覆盖偏好记忆、跨标签同步、存储受限、React 加载前的纯白显示与演示区键盘操作。
Windows 默认使用已安装的 Edge；CI 使用 Playwright Chromium。
可设置 `WEBSITE_TEST_BROWSER` 覆盖浏览器 channel。

```sh
npm run build:website
npm run preview --workspace @codex-switch/website
```

构建产物在 `apps/website/dist/`，不提交 Git。`.prerender/` 是仅供构建使用的
服务端渲染模块，不上传到 Pages，也不需要在服务器运行 Node.js。

## GitHub Pages 自动发布

工作流位于 `.github/workflows/website.yml`。

1. 在仓库 **Settings → Pages → Build and deployment** 中将 Source 设为
   **GitHub Actions**。首次启用需要仓库管理权限。
2. 推送官网、配图或相关依赖变更到 `master`，或手动运行工作流。
3. CI 仅安装官网依赖，完成构建、静态内容检查和浏览器测试。
4. 将 `dist/` 上传为 `github-pages` Artifact，部署到 Pages。

PR 只验证，不发布。工作流只声明发布所需的 `pages: write` 和 `id-token: write`
权限；不构建桌面端、原生移动端或后端，不维护 `gh-pages` 分支。

默认正式地址为 `https://piperhex.github.io/remoteai/`。启用独立域名后，
在仓库 **Settings → Secrets and variables → Actions → Variables** 设置
`WEBSITE_URL` 为完整官网地址，例如 `https://www.example.com/`，
再触发工作流。Pages 的域名与 DNS 必须相应配置。
部署前会对比 Pages 实际地址与 `WEBSITE_URL`，避免发布错误的 canonical。

本地验证独立域名可以设置相同环境变量后构建：

```powershell
$env:WEBSITE_URL = 'https://www.example.com/'
npm run check:website
Remove-Item Env:WEBSITE_URL
```

环境变量控制 Vite 资源前缀、站内链接、语言链接、canonical、结构化数据、
分享图片和 sitemap，不能只修改 HTML 中的域名。它是公开地址，不是密钥。

## SEO 与生成式搜索

### AI 资源页

`/resources/`、`/en/resources/` 和 `/ru/resources/` 收录模型官网、API 文档、本地与开源工具、
Agent 与扩展、评测与学习资料。入口位于页脚的“资源 → AI 资源”，不增加主导航项目。
分类使用原生锚点，外链在新标签页打开；禁用 JavaScript 时仍可完整浏览。
页面继承纯白 / 深色主题，并生成 canonical、语言链接、ItemList 结构化数据和 Markdown 文本版，
自动加入 sitemap 与 llms.txt。

链接以及中文、英文用途说明统一维护在 `src/content/resources.ts`，页面文案位于
`src/content/resources-copy.ts`。俄文页面文案、分类和用途说明位于 `src/content/resources-ru.ts`，
用途说明按资源名称存放；缺失的条目显示英文，构建时输出警告。本次链接核对日期：2026-10-22。
新增或更新资源时检查官网归属、链接目标和用途描述；保留官方入口，避免中转站与推广链接。
模型版本、价格和榜单会变化，不在此复制这些数值；目录收录也不代表 Remote AI 的兼容性承诺。

### 页面与索引

- 每个地址都有完整静态 HTML，正文、步骤、FAQ 和导航不依赖客户端执行。
- 服务端提取 Ant Design 样式，避免页面等待 JavaScript 才获得基本外观。
- 使用语义标题、图片说明、内部链接、独立 title / description。
- 输出 canonical、`zh-CN` / `en` / `ru` / `x-default` hreflang、Open Graph（含 `og:locale:alternate`）
  和 Twitter 元信息。`x-default` 指向中文页面。
- 结构化数据包含 WebSite、WebPage、SoftwareApplication、BreadcrumbList，
  以及与页面可见问答一致的 FAQPage。没有虚构评分、评论或价格。
- 生成 `sitemap.xml`、`robots.txt`、每页 `index.md` 和聚合索引 `llms.txt`。
- `404.html` 使用 `noindex`。不存在的地址不会伪装成首页内容。

**robots.txt 的生效范围**：爬虫只读取域名根目录 `/robots.txt`。
默认项目站点的 `/remoteai/robots.txt` 不具有站点级控制效力；应在对应用户站点
根目录维护规则，或在绑定独立域名后使用本项目生成的根目录文件。
无根目录限制时，页面可正常抓取。可在 Search Console 提交
`https://remoteai.piperhex.com/sitemap.xml`。

Google Search Console 的网址前缀资源为 `https://remoteai.piperhex.com/`，使用 HTML 文件验证。
验证文件保存在 `public/googleffa1f2d3c6214248.html`，构建时原样复制到 `dist/` 根目录，
发布后可通过 `https://remoteai.piperhex.com/googleffa1f2d3c6214248.html` 访问。
请保留文件名和内容，通过验证后也不要删除，以便 Google 后续重新检查所有权。

`llms.txt` 和 Markdown 只是便于读取的补充资料，不代表搜索平台会使用它们。
GEO 的主要工作是提供可抓取的完整内容、清晰的产品实体、具体功能说明、
可信来源和真实使用条件。结构化数据不保证富结果、排名、收录或 AI 引用。
部署后仍需在相应站长平台验证域名、提交 sitemap，并观察实际收录。

参考：

- [GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Ant Design 服务端样式提取](https://ant.design/docs/react/server-side-rendering/)
- [Google：AI 搜索功能与网站](https://developers.google.com/search/docs/appearance/ai-features)
- [Google：robots.txt 简介](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
