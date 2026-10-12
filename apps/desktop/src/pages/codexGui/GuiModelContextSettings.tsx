import { useState } from "react";
import { AutoComplete, Button, Input, Spin } from "antd";
import { guiText } from "../../i18n/guiText";
import { CONTEXT_CAPACITY_PRESETS_K, TOKENS_PER_K } from "../../../../../shared/remote-chat/contextSettings";
import { useModelContextSettings } from "./useModelContextSettings";
import styles from "./GuiModelContextSettings.module.less";

const options = CONTEXT_CAPACITY_PRESETS_K.map((value) => ({ value: String(value), label: `${value}K` }));

export function GuiModelContextSettings() {
  const editor = useModelContextSettings();
  const [model, setModel] = useState("");
  const [capacity, setCapacity] = useState("");
  const disabled = editor.loading || editor.saving;
  const add = async () => {
    if (model.trim() && capacity.trim() && await editor.save(model.trim(), capacity)) {
      setModel(""); setCapacity("");
    }
  };
  return <section className={styles.panel} aria-label={guiText("模型默认上下文")}>
    <div className={styles.heading}><h3>{guiText("模型默认上下文")}</h3>
      <Button size="small" disabled={disabled} onClick={() => void editor.load()}>{guiText("刷新默认值")}</Button>
    </div>
    <p>{guiText("官方模型默认使用管理后台的容量，其他模型跟随供应商设置。当前对话的单独设置优先。")}</p>
    <p>{guiText("修改会自动保存，在下次发送消息或打开对话时应用，不影响正在回复的任务。")}</p>
    {editor.loading && <div role="status"><Spin size="small" /> {guiText("正在读取设置…")}</div>}
    {editor.settings?.usingCachedDefaults && <p role="status" className={styles.notice}>
      {guiText("暂时无法更新默认值，已保留上次的设置。可稍后重试。")}</p>}
    {editor.error && <div role="alert" className={styles.error}>{editor.error}
      {!editor.settings && <Button size="small" onClick={() => void editor.load()}>{guiText("重试")}</Button>}
    </div>}
    {editor.settings && <>
      <div className={styles.list}>
        {editor.models.map((name) => {
          const inherited = editor.settings!.defaults[name];
          const value = editor.draft[name] ?? "";
          return <div className={styles.row} key={name}>
            <div className={styles.model}><strong>{name}</strong><span>{inherited
              ? guiText("默认：{value1}K", { value1: inherited / TOKENS_PER_K }) : guiText("默认：跟随模型")}</span></div>
            <AutoComplete value={value} options={options} disabled={disabled} className={styles.capacity}
              defaultActiveFirstOption={false} onSelect={(next) => void editor.save(name, next)}
              onChange={(next) => editor.change(name, next)}
              onBlur={() => void editor.save(name, value)}>
              <Input aria-label={guiText("{value1} 上下文容量", { value1: name })} suffix="K"
                inputMode="decimal" placeholder={inherited ? String(inherited / TOKENS_PER_K) : guiText("默认")}
                onPressEnter={(event) => event.currentTarget.blur()} />
            </AutoComplete>
            <Button type="link" size="small" disabled={disabled || editor.settings!.overrides[name] == null}
              onClick={() => void editor.save(name, "")}>{guiText("恢复默认")}</Button>
          </div>;
        })}
      </div>
      <div className={styles.add}>
        <Input aria-label={guiText("添加模型名称")} placeholder={guiText("输入模型名称")}
          value={model} disabled={disabled} onChange={(event) => setModel(event.target.value)} />
        <AutoComplete value={capacity} options={options} onChange={setCapacity} disabled={disabled}
          className={styles.capacity}>
          <Input aria-label={guiText("新模型上下文容量")} placeholder={guiText("容量")} suffix="K" inputMode="decimal" />
        </AutoComplete>
        <Button disabled={disabled || !model.trim() || !capacity.trim()} onClick={() => void add()}>
          {guiText("添加")}</Button>
      </div>
      <p>{guiText("1 K = 1000 Token；可用容量会扣除预留空间。")}</p>
    </>}
  </section>;
}
