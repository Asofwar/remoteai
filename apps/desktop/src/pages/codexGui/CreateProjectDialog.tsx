import { guiText } from "../../i18n/guiText";
import { useRef, useState } from "react";
import { Button, Input, Modal, type InputRef } from "antd";
import { Folder, FolderPlus } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { isDesktopApp } from "../../api/backend";
import { folderName, type SavedProject } from "./projectCatalog";
import { useProjectFolderDrop } from "./useProjectFolderDrop";
import styles from "./CreateProjectDialog.module.less";

export function CreateProjectDialog({ disabled, onCreate, onClose, onError }: {
  disabled: boolean; onCreate: (project: SavedProject) => void; onClose: () => void;
  onError: (error: unknown) => void;
}) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [choosing, setChoosing] = useState(false);
  const input = useRef<InputRef>(null);
  const folder = useRef<HTMLButtonElement>(null);
  const setFolder = (selected: string) => {
    setPath(selected);
    setName((current) => current.trim() ? current : folderName(selected));
  };
  const drop = useProjectFolderDrop({ target: folder, enabled: !disabled && !choosing,
    onFolder: setFolder, onError });
  const busy = disabled || choosing || drop.reading;
  const confirm = () => {
    if (!busy && name.trim() && path.trim()) onCreate({ name: name.trim(), path: path.trim() });
  };
  const chooseFolder = async () => {
    if (busy) return;
    setChoosing(true);
    try {
      const selected = await open({ directory: true, multiple: false, title: guiText("选择源文件夹") });
      if (typeof selected === "string") setFolder(selected);
    } catch (error) { onError(error); }
    finally { setChoosing(false); }
  };
  return <Modal open centered title={guiText("创建项目")} width={640} className={styles.dialog}
    onCancel={onClose} maskClosable={!choosing} keyboard={!choosing} closable={!choosing}
    afterOpenChange={(visible) => { if (visible) input.current?.focus(); }}
    footer={<div className={styles.actions}>
      <Button type="text" disabled={choosing} onClick={onClose}>{guiText("取消")}</Button>
      <Button className={styles.create} type="primary" disabled={busy || !name.trim() || !path.trim()}
        onClick={confirm}>{guiText("创建项目")}</Button>
    </div>}>
    <Input ref={input} className={styles.name} prefix={<Folder size={19} aria-hidden="true" />}
      aria-label={guiText("项目名称")} placeholder={guiText("项目名称")} value={name} maxLength={120} disabled={busy}
      onChange={(event) => setName(event.target.value)} onPressEnter={confirm} />
    <div className={styles.label}>{guiText("源文件夹")}</div>
    {isDesktopApp ? <button ref={folder} type="button" className={styles.folder} disabled={busy}
      data-dragging={drop.dragging || undefined} aria-busy={drop.reading}
      onClick={() => void chooseFolder()}>
      <FolderPlus size={23} aria-hidden="true" />
      {path ? <><strong>{folderName(path)}</strong><span className={styles.path}>{path}</span>
        <small>{guiText("点击或拖入其他文件夹以更换")}</small></> : <span>
        {choosing || drop.reading ? guiText("正在读取文件夹…") : guiText("拖入文件夹，或点击选择")}</span>}
    </button> : <div className={styles.hostFolder}>
      <Input aria-label={guiText("源文件夹路径")} placeholder={guiText("输入源文件夹的完整路径")} value={path} disabled={busy}
        onChange={(event) => setPath(event.target.value)} onPressEnter={confirm} />
      <p>{guiText("填写运行 Remote AI 的主机上的文件夹路径。")}</p>
    </div>}
  </Modal>;
}
