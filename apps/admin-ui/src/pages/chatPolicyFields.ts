import type { ChatPolicy } from '../../../../shared/remote-chat/policy';
type Copy = [string, string];
export interface PolicyField { key: keyof ChatPolicy; label: Copy; hint: Copy; unit: Copy }
export interface PolicySection { key: string; title: Copy; hint: Copy; fields: PolicyField[] }
export const POLICY_SECTIONS: PolicySection[] = [
  { key: 'images', title: ['图片', 'Images'], hint: ['分别设置添加、查看和压缩图片的限制，数值不设上限。',
    'Set image upload, viewing and compression limits. Values have no upper cap.'], fields: [
    { key: 'imageSourceMaxMb', label: ['添加图片上限', 'Image upload limit'],
      hint: ['选择图片时允许的最大文件大小', 'Maximum size when selecting an image'], unit: ['MB', 'MB'] },
    { key: 'imagePreviewMaxMb', label: ['原图查看上限', 'Original image limit'],
      hint: ['打开聊天原图时允许的最大文件大小', 'Maximum size when opening an original image'], unit: ['MB', 'MB'] },
    { key: 'imageMaxEdge', label: ['压缩后最长边', 'Maximum image edge'],
      hint: ['超过此尺寸时等比缩小', 'Larger images are resized proportionally'], unit: ['像素', 'px'] },
    { key: 'imageTargetKb', label: ['压缩目标大小', 'Compressed image size'],
      hint: ['单张图片压缩后的大小上限', 'Target size for each compressed image'], unit: ['KB', 'KB'] },
  ] },
  { key: 'video', title: ['视频', 'Video'], hint: ['在应用内播放，数值不设上限。',
    'Play videos in the app. The value has no upper cap.'], fields: [
    { key: 'videoPreviewMaxMb', label: ['视频播放上限', 'Video playback limit'],
      hint: ['允许播放的最大视频文件大小', 'Maximum video file size for playback'], unit: ['MB', 'MB'] },
  ] },
  { key: 'history', title: ['聊天记录', 'Chat history'], hint: ['调整每次加载的内容数量。',
    'Choose how much content to load at a time.'], fields: [
    { key: 'threadPageSize', label: ['会话数量', 'Conversations per page'],
      hint: ['每次加载 1–100 个会话', 'Load 1–100 conversations at a time'], unit: ['个', 'items'] },
    { key: 'historyPageSize', label: ['历史消息数量', 'History messages per page'],
      hint: ['每次加载 1–100 条历史消息', 'Load 1–100 older messages at a time'], unit: ['条', 'items'] },
  ] },
  { key: 'files', title: ['文件', 'Files'], hint: ['设置文本预览和文件下载的大小限制。',
    'Set size limits for text previews and downloads.'], fields: [
    { key: 'filePreviewMaxMb', label: ['文本查看上限', 'Text preview limit'],
      hint: ['支持 1–2 MB 的文本文件', 'Allow text files up to 1–2 MB'], unit: ['MB', 'MB'] },
    { key: 'fileDownloadMaxMb', label: ['文件下载上限', 'File download limit'],
      hint: ['支持设置为 1–20 MB', 'Choose a limit from 1–20 MB'], unit: ['MB', 'MB'] },
  ] },
];
