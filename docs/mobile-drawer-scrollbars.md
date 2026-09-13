# 移动端抽屉滚动条检查

2026-09-13：底部抽屉的主滚动区域铺满抽屉宽度，滚动条位于右边缘；左右 20dp 留白属于内容。
标题、关闭按钮和底部操作保持原间距。原有限制正文宽度的抽屉仍保持最多 400dp 正文，宽屏视口不跟随正文缩窄。

## 覆盖范围

共迁移 24 处主滚动区域：

| 区域 | 抽屉 |
| --- | --- |
| 对话 | 处理过程、工具详情、文件差异、文件预览、工具输入与结构化结果、计划/修改/错误详情、待补充问题 |
| 聊天选项 | 模型/推理/权限选择、电脑选择、聊天账户切换、项目选择、电脑文件/照片 |
| 账号和验证 | 账号资料、额度账号选择、远程模型选择、2FA 表单 |
| 管理 | 官方账号编辑、绑定用户、创建邀请、注册用户、赠送账号、反馈详情、邮件回复、用户编辑 |

聊天侧栏的 SectionList 和搜索页的 FlatList 已是全宽视口，保留现有布局。
无滚动内容的确认抽屉保留默认内边距。命令内部的独立滚动区域也将留白移入内容，滚动条贴其自身边缘。

## 验证方式

Android 回归脚本直接检查原生 ScrollView 边界和文字边界，验证打开、滚动和进入下一层抽屉。
仅使用可清空数据的模拟器与本地测试服务：

```powershell
# 终端一，工作目录 apps/desktop
node e2e/mobile-fixture.mjs

# 终端二，仓库根目录；先构建 Android Release APK
$env:ANDROID_CHAT_DISPOSABLE='1'
$env:ANDROID_CHAT_OUTPUT='drawer-scrollbars-emulator'
node apps/desktop/e2e/android-sheet-scrollbars-regression.mjs
```

报告与截图写入 `.codex-tmp/drawer-scrollbars-emulator/`。
真机覆盖安装保留登录数据，并用已连接电脑的真实历史对话检查处理过程和命令详情。

## 实测记录

- 1080px 宽的 Android 真机：真实处理过程视口由 `[55,1435][1025,2356]` 改为
  `[0,1435][1080,2356]`，正文仍从 x=55 开始；命令详情视口为 `[0,1525][1080,2356]`。
- 同一真机的模型选择和 2FA 表单视口同样覆盖 x=0～1080；2FA 滑动截图可见滚动条贴最右边，底部按钮固定。
- 真机截图：`.codex-tmp/phone-pc-parity/drawer-scrollbar-before.png`、`drawer-scrollbar-after.png`、
  `drawer-command-verified.png`、`drawer-models-after.png`、`drawer-totp-scrolling.png`。
- Android Release 构建、原生 TypeScript 检查通过；原生测试 45 个文件、214 项通过。
- 模拟器 10 项布局检查通过，覆盖处理过程及滑动、命令详情、模型和权限选项、账户和电脑列表、
  项目列表、1600px 宽屏项目列表、2FA 表单。Clippy 检查通过。

管理抽屉、额度操作和工具全部结果类型完成代码路径检查，没有逐一在生产账号上执行业务操作。
