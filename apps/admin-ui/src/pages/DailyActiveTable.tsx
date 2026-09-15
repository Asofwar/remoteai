import { Table } from "antd";
import type { TableColumnsType } from "antd";
import { useI18n } from "../i18n-context";
import type { DashboardOverview } from "../types";
import { dashboardPlatforms } from "./dashboard-trend";

type DailyActiveRow = DashboardOverview["dailyActiveTrend"][number];

export function DailyActiveTable({ data, loading }: { data: DailyActiveRow[]; loading: boolean }) {
  const { t } = useI18n();
  const columns: TableColumnsType<DailyActiveRow> = [
    { title: t("dashboard.activityDate"), dataIndex: "date", width: 140 },
    { title: t("dashboard.activityTotal"), dataIndex: "total", align: "right" },
    ...dashboardPlatforms.map((platform) => ({
      title: platform.label,
      key: platform.name,
      align: "right" as const,
      render: (_value: unknown, row: DailyActiveRow) => (
        row.platforms.find((item) => item.name === platform.name)?.value ?? 0
      ),
    })),
  ];
  return (
    <article className="dashboard-panel">
      <div className="dashboard-panel-heading">
        <div>
          <h2>{t("dashboard.dailyActiveHistory")}</h2>
          <span>{t("dashboard.dailyActiveHistoryNote")}</span>
        </div>
      </div>
      <Table
        rowKey="date"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={[...data].reverse()}
        pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
        scroll={{ x: 720 }}
      />
    </article>
  );
}
