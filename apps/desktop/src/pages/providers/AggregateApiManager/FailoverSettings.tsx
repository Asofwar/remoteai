import { Button, Form, InputNumber, Select, Switch, type FormInstance } from "antd";
import type { Translate } from "../../../i18n";
import {
  defaultFailoverPolicy, FAILOVER_LIMITS, isFailoverInteger, validRetryStatusCodes,
} from "./failoverPolicy";
import styles from "./index.module.less";
import { RoutingSettings } from "./RoutingSettings";

interface FailoverSettingsProps {
  form: FormInstance;
  t: Translate;
}

const STATUS_OPTIONS = Array.from({ length: 200 }, (_, index) => ({
  value: index + 400, label: String(index + 400),
}));

function IntegerSetting({ name, maximum, t }: {
  name: "maxAttempts" | "failureThreshold" | "initialCooldownSeconds";
  maximum: number;
  t: Translate;
}) {
  return <Form.Item name={["failoverPolicy", name]} label={t(`providers.aggregate.failover.${name}`)}
    rules={[{ validator: (_, value: unknown) => isFailoverInteger(value, maximum)
      ? Promise.resolve() : Promise.reject(new Error(t("providers.aggregate.failover.error.integer", {
        max: maximum,
      }))) }]}>
    <InputNumber min={1} max={maximum} precision={0} style={{ width: "100%" }} />
  </Form.Item>;
}

export function FailoverSettings({ form, t }: FailoverSettingsProps) {
  const enabled = Form.useWatch(["failoverPolicy", "enabled"], form) ?? true;
  return <details className={styles.failover}>
    <summary>{t("providers.aggregate.failover.title")}</summary>
    <p className={styles.hint}>{t("providers.aggregate.failover.description")}</p>
    <Form.Item name={["failoverPolicy", "enabled"]} label={t("providers.aggregate.failover.enabled")}
      valuePropName="checked">
      <Switch />
    </Form.Item>
    {!enabled && <p className={styles.hint}>{t("providers.aggregate.failover.disabledHint")}</p>}
    <div>
      <RoutingSettings form={form} />
      <div className={styles.policyGrid}>
        <IntegerSetting name="maxAttempts" maximum={FAILOVER_LIMITS.maxAttempts} t={t} />
        <IntegerSetting name="failureThreshold" maximum={FAILOVER_LIMITS.failureThreshold} t={t} />
        <IntegerSetting name="initialCooldownSeconds" maximum={FAILOVER_LIMITS.initialCooldownSeconds} t={t} />
        <Form.Item name={["failoverPolicy", "maxCooldownSeconds"]}
          label={t("providers.aggregate.failover.maxCooldownSeconds")}
          dependencies={[["failoverPolicy", "initialCooldownSeconds"]]}
          rules={[{ validator: (_, value: unknown) => {
            const minimum = form.getFieldValue(["failoverPolicy", "initialCooldownSeconds"]) as number;
            return isFailoverInteger(value, FAILOVER_LIMITS.maxCooldownSeconds) && value >= minimum
              ? Promise.resolve()
              : Promise.reject(new Error(t("providers.aggregate.failover.error.cooldown")));
          } }]}>
          <InputNumber min={1} max={FAILOVER_LIMITS.maxCooldownSeconds} precision={0} style={{ width: "100%" }} />
        </Form.Item>
      </div>
      <Form.Item name={["failoverPolicy", "retryStatusCodes"]}
        label={t("providers.aggregate.failover.retryStatusCodes")}
        rules={[{ validator: (_, value: unknown) => validRetryStatusCodes(value)
          ? Promise.resolve() : Promise.reject(new Error(t("providers.aggregate.failover.error.statusCodes"))) }]}>
        <Select mode="multiple" options={STATUS_OPTIONS} maxCount={FAILOVER_LIMITS.statusCodes}
          allowClear placeholder={t("providers.aggregate.failover.noStatusCodes")} />
      </Form.Item>
      <Form.Item name={["failoverPolicy", "retryOnNetworkErrors"]}
        label={t("providers.aggregate.failover.retryOnNetworkErrors")} valuePropName="checked">
        <Switch />
      </Form.Item>
      <p className={styles.hint}>{t("providers.aggregate.failover.networkHint")}</p>
      <Form.Item name={["failoverPolicy", "respectRetryAfter"]}
        label={t("providers.aggregate.failover.respectRetryAfter")} valuePropName="checked">
        <Switch />
      </Form.Item>
      <p className={styles.hint}>{t("providers.aggregate.failover.retryAfterHint")}</p>
    </div>
    <Button size="small" onClick={() => form.setFieldValue("failoverPolicy", defaultFailoverPolicy())}>
      {t("providers.aggregate.failover.restoreDefaults")}
    </Button>
  </details>;
}
