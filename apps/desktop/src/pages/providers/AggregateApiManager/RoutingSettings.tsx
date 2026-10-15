import { Form, InputNumber, Select, type FormInstance } from "antd";
import { guiText } from "../../../i18n/guiText";
import { isFailoverInteger } from "./failoverPolicy";
import styles from "./index.module.less";

const integerRule = (max: number) => ({ validator: (_: unknown, value: unknown) =>
  isFailoverInteger(value, max) ? Promise.resolve()
    : Promise.reject(new Error(guiText("请输入 1 到 {max} 之间的整数。", { max }))) });

export function RoutingSettings({ form }: { form: FormInstance }) {
  const rate = Form.useWatch(["failoverPolicy", "errorRateThresholdPercent"], form);
  return <>
    <Form.Item name={["failoverPolicy", "routingStrategy"]} label={guiText("服务选择方式")}>
      <Select options={[
        { value: "balanced", label: guiText("均衡分配") },
        { value: "priority", label: guiText("按优先顺序备援") },
      ]} />
    </Form.Item>
    <Form.Item name={["failoverPolicy", "recoverySuccessThreshold"]} label={guiText("恢复前成功探测次数")}
      rules={[integerRule(10)]}>
      <InputNumber min={1} max={10} precision={0} style={{ width: "100%" }} />
    </Form.Item>
    <Form.Item name={["failoverPolicy", "errorRateThresholdPercent"]} label={guiText("错误率停用阈值（%）")}
      rules={[{ validator: (_, value: unknown) => value == null || isFailoverInteger(value, 100)
        ? Promise.resolve() : Promise.reject(new Error(guiText("请输入 1 到 {max} 之间的整数。", { max: 100 }))) }]}>
      <InputNumber min={1} max={100} precision={0} placeholder={guiText("留空时关闭")}
        style={{ width: "100%" }} />
    </Form.Item>
    <Form.Item name={["failoverPolicy", "errorRateMinRequests"]} label={guiText("错误率最少样本数")}
      rules={[integerRule(100)]}>
      <InputNumber min={1} max={100} precision={0} disabled={rate == null} style={{ width: "100%" }} />
    </Form.Item>
    <p className={styles.hint}>{guiText("按最近 100 次明确成功或失败的请求计算错误率。取消的请求不计入。")}</p>
  </>;
}
