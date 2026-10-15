import { Tag } from "antd";
import type { Translate } from "../../../i18n";
import type { AggregateApi, Provider } from "../../../types";
import styles from "./index.module.less";

export function MemberHealth({ aggregate, providers, t }: {
  aggregate: AggregateApi;
  providers: Provider[];
  t: Translate;
}) {
  if (!aggregate.memberHealth || aggregate.failoverPolicy?.enabled === false) return null;
  return <div className={styles.memberHealth}>
    {aggregate.memberProviderIds.map((id) => {
      const health = aggregate.memberHealth?.[id];
      const provider = providers.find((item) => item.id === id);
      if (!health || !provider) return null;
      const color = health.state === "healthy" ? "green" : health.state === "recovering" ? "blue" : "orange";
      return <Tag key={id} color={color}>
        {provider.name} · {t(`providers.aggregate.health.${health.state}`, {
          seconds: Math.max(0, Math.ceil(health.retryAfterSeconds)),
        })}
      </Tag>;
    })}
  </div>;
}
