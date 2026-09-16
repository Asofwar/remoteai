# 手机附件上传进度

手机发送本地文件或照片时，输入框上方显示准备上传、实际上传百分比、等待电脑确认三个阶段。
上传中断时显示重连提示；失败后保留草稿，结束后清除进度。电脑已有文件和插件引用不显示上传进度。

传输 v2 使用电脑的分片接收确认更新进度，重传不重复计数。旧版连接使用实际发出的分片更新进度，
仍需等待电脑响应才清除草稿。进度按整百分比更新，不增加轮询或修改线上协议。

## 2026-09-16 真机验证

- Android 14 Xiaomi Civi 1S 真机，保留登录与配对，覆盖安装本次源码构建的 arm64 Release APK。
- 已配对的 Hyper-V Windows 11 `win11`，设备名 `ZH2`，沿用实际桌面应用、连接和模型。
- 使用用户提供的视频，文件为 4,827,113 字节，SHA-256 为
  `B81A13432A3E1DED19DA99F88652EAD0BBB691D2E2AFD059224F781E55CA2502`。
- 新聊天通过 P2P 上传，捕获准备状态以及 8%、17%、25%、48%、56%、65%、73%、83%、91% 等进度。
  Windows 实际执行只读 PowerShell 文件校验，大小和哈希均一致；手机草稿与进度清除。
- 现有聊天再次上传同一文件，在上传中临时断开 Wi-Fi。进度保持 16%，显示重连提示，
  恢复网络后经过 Relay（截图记录 18%）继续上传，再回到 P2P 完成。
  捕获“上传完成，等待电脑确认…”；Windows 第二次校验的大小和哈希仍一致。
- 测试结束后恢复原网络设置（Wi-Fi 开、移动数据关）。本次未验证持续蜂窝网络上传或 iOS。

本地证据位于 `.codex-tmp/upload-progress/`：`p2p-keyboard-3.png`、`resume-10.png`、
`resume-samples.json`、`resume.mp4`、`windows-file-verified.png`、`windows-resume-verified.png`。
APK 为 `CodexSwitch-upload-progress.apk`，SHA-256：
`4B3AD46BDC3B33CA6AAA78FBF5B789A99312FA3314FA3C9E949B0A4F886B2219`。

## 自动检查

- 新增传输确认、重传去重、旧连接重试、响应/失败/断线后停止回调测试。
- 新增手机控制器准备/上传/确认阶段、禁止重复发送、成功/失败后清除进度测试。
- 手机 TypeScript 检查和测试、桌面 TypeScript/Vite 生产构建与测试通过。
- `cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`、Rust 测试通过。
