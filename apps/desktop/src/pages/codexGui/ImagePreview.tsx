import { ImageViewer } from "../../../../../shared/chat/ImageViewer";
import { useImageMenu } from "./useImageMenu";

interface Props {
  thumbnail: string;
  description: string;
  load: () => Promise<string>;
  close: () => void;
}

export function ImagePreview(props: Props) {
  const menu = useImageMenu();
  return <ImageViewer {...props} {...menu} />;
}
