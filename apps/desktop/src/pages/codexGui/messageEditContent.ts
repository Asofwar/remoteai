import type { Content } from "./types";

export interface MessageEditContent { text: string; removedImageIndexes?: number[] }
export type SubmitMessageEdit = (content: MessageEditContent) => Promise<boolean>;

export function isMessageImage(part: Content): boolean {
  return part.type === "image" || part.type === "localImage";
}

/** Image positions refer to the original message, including images removed from the draft. */
export function retainedMessageParts(parts: Content[], removedImageIndexes: number[] = []): Content[] {
  const removed = new Set(removedImageIndexes);
  let imageIndex = 0;
  return parts.filter((part) => !isMessageImage(part) || !removed.has(imageIndex++));
}
