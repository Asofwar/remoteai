# Android 聊天记录闪烁实机回归

## 环境：2026-09-14

- USB 连接的 Android 实体机：2109119BC，Android 14 / API 34，1080 × 2400。
- 本地 Hyper-V Windows 11 虚拟机运行 PC 应用，沿用现有上游 Codex Switch 连接。
- 手机和虚拟机均先从 1.5.8 覆盖升级到官方 [v1.5.10](https://github.com/piperhex/codex-switch/releases/tag/v1.5.10)。
  虚拟机安装退出码为 0，安装后进程响应正常；手机恢复 P2P 连接，登录与历史数据保留。
- 复现后以 v1.5.10 源码加本次修复单独构建 Android arm64 Release APK，再覆盖安装同一实体机。
  PC 保持官方 v1.5.10；本次没有发布新的版本号。

## 已复现并修复

### 图片陆续加载时挤动旧消息

打开含两张图片的已完成对话，文字先显示，图片预览依次替换加载提示并调整宽高比。
列表因此反复改变高度和滚动位置。原始录屏中，同一条最终回复的垂直位置变化范围为 750 个屏幕像素。

现在加载、显示、失败和重试共用固定比例的预览区域；图片按原比例完整缩放，点击仍可查看原图。
预览不再根据异步解码结果改变聊天行高度，Android 图片显示也不再使用额外淡入动画。

### 无工具的实时对话被加载提示遮住

在新聊天中要求真实模型输出 45 行中文，保持键盘展开。
官方版本的历史加载提示在等待及输出期间遮住消息，到完成后才出现最终内容。
原判断只放行包含处理活动的实时对话，遗漏了没有工具和过程说明的普通回复。

现在当前页面见过的运行中轮次均保持可见，完成时也不重新盖上加载提示。
重新打开已经完成的旧对话仍等待首次滚动定位，避免提前露出错误位置。

## 修复版实测结果

| 场景 | 结果 | 本地证据 |
| --- | --- | --- |
| 同一图片历史首次打开 | 回复位置变化 0 像素，29 个可匹配的实际录制帧 | `fixed-image-cold.mp4`、`fixed-image-cold-anchor.json` |
| 图片历史缓存重开 | 回复位置变化 0 像素，23 个可匹配帧 | `fixed-image-cached.mp4`、`fixed-image-cached-anchor.json` |
| 切换长对话后再次打开图片历史 | 回复位置变化 0 像素，24 个可匹配帧 | `fixed-image-repeat.mp4`、`fixed-image-repeat-anchor.json` |
| 图片放大与返回 | 原图可打开，返回聊天正常 | `fixed-image-preview.png` |
| 普通短历史 | 显示后未检测到再次空白或位置跳动 | `fixed-short.mp4`、`fixed-short-analysis.json` |
| 真实多轮长历史 | 显示后未检测到再次空白或位置跳动 | `fixed-long-history.mp4`、`fixed-long-history-analysis.json` |
| 新建纯文字对话、键盘展开 | 用户消息立即可读，45 行回复逐步显示，完整收到 `HISTORY-END` | `fixed-live-long.mp4`、`fixed-live-contact.jpg` |
| 上翻旧消息后开关键盘、前后台切换 | 同一条旧消息顶端位置变化均为 0 像素，保持 P2P | `reading-position.json` |

官方版本还测试了真实命令运行、任务完成和上翻后的恢复：模型执行一次输出与 45 秒等待，最后回复 `DONE`。
任务完成和前后台切换后已读旧消息的位置保留。对应录屏为 `release-active-recovery.mp4`。

录像和量化结果保存在本地 `.codex-tmp/phone-history-flicker/`，不随文档提交。
图片预览及阅读位置截图保存在 `.codex-tmp/phone-pc-parity/`。
位移测量使用录屏实际帧，对同一回复文字进行模板匹配；未将图片自身加载后的像素变化误算成位置变化。
本次覆盖同一局域网中的实体 Android 与 Windows 虚拟机，不包含 iOS、蜂窝网络或跨 NAT 环境。

## 验证与安装包

本次修复在独立源码副本中验证，避免混入工作区同时进行的其他功能修改：

- Android TypeScript 检查及 50 个测试文件、239 项测试通过。
- 新增测试覆盖无工具轮次开始、流式追加、完成后保持可见及重新打开已完成历史。
- Rust 格式检查通过，1,110 项测试通过、5 项忽略；严格 Clippy 检查通过。
- 桌面 TypeScript / Vite 生产构建通过。
- Android arm64 Release 构建成功，并已覆盖安装实体机。

修复包：`.codex-tmp/phone-history-flicker/CodexSwitch-1.5.10-history-fix.apk`。
SHA-256：`6c38448389bcf45f6e1b2d3ead914030e0073a8c59fdc37a29b7bf66c295cc28`。
