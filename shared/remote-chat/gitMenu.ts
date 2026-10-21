import type { GitChange, GitResetMode } from './gitTypes';

export const GIT_LONG_PRESS_MS = 500;

export function gitFileMenuLabels(folder: boolean) {
  return {
    commit: folder ? '提交文件夹内改动' : '提交单个文件',
    rollback: folder ? '回退文件夹内改动' : '回退单个文件',
    delete: folder ? '删除文件夹内改动文件' : '删除文件',
  };
}

export function deletableGitFiles(files: GitChange[]) {
  return files.filter(file => file.status[1] !== 'D' && file.status !== 'D ');
}

export const GIT_RESET_MODES: { value: GitResetMode; label: string; description: string }[] = [
  { value: 'soft', label: '保留改动并暂存（Soft）', description: '保留文件和暂存区，撤回的提交可重新提交。' },
  { value: 'mixed', label: '保留改动，取消暂存（Mixed）', description: '保留文件，将与目标提交的差异放回未暂存改动。' },
  { value: 'hard', label: '放弃改动（Hard）',
    description: '文件和暂存区将恢复到此提交，未提交的改动及阻挡恢复的未跟踪文件会丢失。' },
  { value: 'keep', label: '保留未提交改动（Keep）', description: '保留未提交的改动；如与目标提交冲突，将停止重置。' },
];
