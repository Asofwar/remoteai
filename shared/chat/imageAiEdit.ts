export const IMAGE_AI_TOOLS = [
  { id: 'annotate', label: '标注', hint: '描述标注的位置、内容和样式' },
  { id: 'comment', label: '添加评论', hint: '描述评论的位置和文字内容' },
  { id: 'background', label: '移除背景', hint: '可补充需要保留的主体' },
  { id: 'erase', label: '擦除', hint: '描述要擦除的物体或区域' },
  { id: 'resize', label: '调整大小', hint: '可补充裁剪或留白要求' },
] as const;
export type ImageAiTool = typeof IMAGE_AI_TOOLS[number]['id'];
export interface ImageAiRequest { tool: ImageAiTool; detail: string; width: string; height: string }
const MAX_DIMENSION = 16384;
export function imageAiPrompt(input: ImageAiRequest): string {
  const detail = input.detail.trim();
  if (['annotate', 'comment', 'erase'].includes(input.tool) && !detail) {
    throw new Error('请填写编辑要求。');
  }
  let instruction: string;
  switch (input.tool) {
    case 'annotate': instruction = `按以下要求在图片上添加标注：${detail}`; break;
    case 'comment': instruction = `在指定位置添加清晰可读的评论文字：${detail}`; break;
    case 'background': instruction = `移除背景，保留主体，输出透明背景 PNG。${detail}`; break;
    case 'erase': instruction = `擦除以下物体或区域，自然补全背景：${detail}`; break;
    case 'resize': {
      const dimensions = [input.width, input.height];
      if (dimensions.some(value => !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > MAX_DIMENSION)) {
        throw new Error('宽高请输入 1–16384 之间的整数。');
      }
      instruction = `将图片调整为 ${Number(input.width)} × ${Number(input.height)} 像素。${detail}`;
    }
  }
  return `请调用 AI 图片编辑能力编辑本条消息附带的原图。${instruction}\n`
    + '保留未要求修改的内容。请返回编辑后的图片；如果无法完成，请说明原因，不要声称已完成。';
}
