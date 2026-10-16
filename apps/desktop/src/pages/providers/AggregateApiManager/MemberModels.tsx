import { useEffect } from "react";
import { AutoComplete, Button, Form, Select, Space, type FormInstance } from "antd";
import { ArrowDown, ArrowUp } from "lucide-react";
import { guiText } from "../../../i18n/guiText";
import type { AggregateMemberOption } from "../../../utils/aggregateMembers";
import styles from "./index.module.less";

export function MemberModels({ form, providers }: { form: FormInstance; providers: AggregateMemberOption[] }) {
  const selected: string[] = Form.useWatch("memberProviderIds", form) ?? [];
  const model: string = Form.useWatch("model", form) ?? "";
  const strategy: string = Form.useWatch(["failoverPolicy", "routingStrategy"], form) ?? "balanced";
  useEffect(() => {
    for (const id of selected) {
      const provider = providers.find(entry => entry.id === id);
      if (!provider || form.getFieldValue(["memberModels", id])) continue;
      const models = [provider.model, ...provider.models];
      form.setFieldValue(["memberModels", id], models.includes(model) ? model : provider.model || model);
    }
  }, [selected, model, providers, form]);
  const move = (index: number, direction: number) => {
    const next = [...selected];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    form.setFieldValue("memberProviderIds", next);
  };
  if (!selected.length) return null;
  return <div>
    <p className={styles.hint}>{guiText("各服务可使用不同的模型名称。逻辑模型名称保持一致。")}</p>
    {strategy === "priority" && <p className={styles.hint}>
      {guiText("按从上到下的顺序选择服务；已有会话优先保持当前服务。")}</p>}
    {selected.map((id, index) => {
      const provider = providers.find(entry => entry.id === id);
      if (!provider) return null;
      const models = [...new Set([provider.model, ...provider.models])].filter(Boolean);
      return <Form.Item key={id} label={<Space>{`${index + 1}. ${provider.name}`}
        {strategy === "priority" && <>
          <Button size="small" disabled={!index} aria-label={guiText("提高服务优先级")}
            icon={<ArrowUp size={13} />} onClick={() => move(index, -1)} />
          <Button size="small" disabled={index === selected.length - 1} aria-label={guiText("降低服务优先级")}
            icon={<ArrowDown size={13} />} onClick={() => move(index, 1)} />
        </>}</Space>}>
        <Form.Item name={["memberModels", id]} noStyle rules={[{ required: true, whitespace: true,
          message: guiText("请选择此服务的模型。") }]}>
          {provider.accountId ? <AutoComplete options={models.map(value => ({ label: value, value }))}
            maxLength={256} aria-label={`${provider.name} ${guiText("上游模型")}`}
            filterOption={(input, option) => String(option?.value).toLowerCase().includes(input.toLowerCase())} />
            : <Select options={models.map(value => ({ label: value, value }))} showSearch
              aria-label={`${provider.name} ${guiText("上游模型")}`} />}
        </Form.Item>
      </Form.Item>;
    })}
  </div>;
}
