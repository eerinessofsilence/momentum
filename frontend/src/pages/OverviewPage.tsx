import { ArrowDown as ArrowDownToLine, ArrowUpRight, CurrencyDollar as CircleDollarSign, ArrowsClockwise as RefreshCw } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { localizeClientError, useClientI18n } from "../clientI18n";
import { useShell } from "../components/AppShell";
import { AsyncState, PageHeading, TransactionRow, WalletRow } from "../components/PageParts";
import { Card, CardHeader, Tabs } from "../components/UI";
import { money } from "../format";
import { navigate } from "../router";
import type { DashboardData, DashboardPeriod } from "../types";

const periods: DashboardPeriod[] = ["1H", "24H", "1W", "1M", "ALL"];

function initialPeriod(): DashboardPeriod {
  const saved = window.localStorage.getItem("momentum:dashboard-period") as DashboardPeriod;
  return periods.includes(saved) ? saved : "24H";
}

export function OverviewPage() {
  const { user } = useAuth();
  const { locale, t } = useClientI18n();
  const { openAction } = useShell();
  const [data, setData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod>(initialPeriod);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api<DashboardData>("/dashboard")
      .then(setData)
      .catch((err: Error) => setError(localizeClientError(err.message, locale)))
      .finally(() => setLoading(false));
  }, [locale]);

  useEffect(() => {
    load();
    window.addEventListener("momentum:data-changed", load);
    return () => window.removeEventListener("momentum:data-changed", load);
  }, [load]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? t("goodMorning") : hour < 18 ? t("goodAfternoon") : t("goodEvening");
  }, [t]);

  const selectPeriod = (nextPeriod: DashboardPeriod) => {
    setPeriod(nextPeriod);
    window.localStorage.setItem("momentum:dashboard-period", nextPeriod);
  };

  return (
    <div className="page-content overview-page">
      <PageHeading
        title={`${greeting}, ${user?.name}`}
        description={t("portfolioSnapshot")}
      />
      <AsyncState loading={loading} error={error} retryLabel={t("retry")} onRetry={load}>
      {data ? (
        <>
          <section className="balance-card">
            <div className="balance-content">
              <span className="balance-label">{t("totalPortfolio")}</span>
              <h2>{money(data.total_balance)}</h2>
              <div className="quick-actions">
                <button onClick={() => openAction("receive")}>
                  <span>
                    <ArrowDownToLine size={24} />
                  </span>
                  <strong>{t("receive")}</strong>
                </button>
                <button onClick={() => openAction("send")}>
                  <span>
                    <ArrowUpRight size={24} />
                  </span>
                  <strong>{t("send")}</strong>
                </button>
                <button onClick={() => openAction("buy")}>
                  <span>
                    <CircleDollarSign size={24} />
                  </span>
                  <strong>{t("buy")}</strong>
                </button>
                <button onClick={() => openAction("swap")}>
                  <span>
                    <RefreshCw size={24} />
                  </span>
                  <strong>{t("swap")}</strong>
                </button>
              </div>
              <span
                className={`balance-change ${Number(data.periods[period].change) >= 0 ? "positive" : "negative"}`}
                aria-live="polite">
                {Number(data.periods[period].change) >= 0 ? "↑" : "↓"}{" "}
                {Math.abs(Number(data.periods[period].change)).toFixed(2)}% · {period}
              </span>
            </div>
            <BalanceChart
              key={period}
              values={data.periods[period].values}
              positive={Number(data.periods[period].change) >= 0}
              label={t("portfolioValueChart")}
            />
            <span className="balance-card__lower-accent" aria-hidden="true" />
            <Tabs
              className="period-switcher"
              variant="compact"
              ariaLabel={t("chartPeriod")}
              value={period}
              onChange={selectPeriod}
              items={periods.map((item) => ({ value: item, label: item }))}
            />
          </section>
          <div className="overview-grid">
            <Card className="panel-card">
              <CardHeader title={t("portfolio")} trailing={<span>{data.wallets.length} {t("chains")}</span>} />
              <div className="panel-list">
                {data.wallets.map((wallet) => (
                  <WalletRow key={wallet.id} wallet={wallet} compact />
                ))}
              </div>
            </Card>
            <Card className="panel-card recent-card">
              <CardHeader title={t("recentTransactions")} trailing={<a href="/app/history" onClick={(event) => { event.preventDefault(); navigate('/app/history') }}>{t("viewAll")}</a>} />
              <div className="panel-list">
                {data.transactions.slice(0, 4).map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} compact />
                ))}
              </div>
            </Card>
          </div>
        </>
      ) : null}
      </AsyncState>
    </div>
  );
}

function BalanceChart({ values, positive, label }: { values: string[]; positive: boolean; label: string }) {
  const width = 1200;
  const height = 190;
  const numbers = values.map(Number);
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const points = numbers.map((value, index) => {
    const isLast = index === numbers.length - 1;
    const x = isLast ? width + 8 : (index / Math.max(1, numbers.length - 1)) * width;
    const y = height - 24 - ((value - min) / Math.max(1, max - min)) * 115;
    return [x, y];
  });
  const line = smoothChartPath(points);
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const lineColor = positive ? "#45D6A1" : "#E54856";
  const areaColor = positive ? "#24C48C" : "#FF2D3D";
  return (
    <svg
      className="balance-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-label={label}>
      <defs>
        <linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={areaColor} stopOpacity={positive ? ".26" : ".35"} />
          <stop offset="1" stopColor={areaColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="balance-chart__area" d={area} fill="url(#chart-area)" />
      <path
        className="balance-chart__line"
        d={line}
        fill="none"
        stroke={lineColor}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function smoothChartPath(points: number[][]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;

  const tension = 0.72;
  let path = `M ${points[0][0]} ${points[0][1]}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const following = points[Math.min(points.length - 1, index + 2)];
    const firstControlX = current[0] + ((next[0] - previous[0]) * tension) / 6;
    const firstControlY = current[1] + ((next[1] - previous[1]) * tension) / 6;
    const secondControlX = next[0] - ((following[0] - current[0]) * tension) / 6;
    const secondControlY = next[1] - ((following[1] - current[1]) * tension) / 6;

    path += ` C ${firstControlX} ${firstControlY}, ${secondControlX} ${secondControlY}, ${next[0]} ${next[1]}`;
  }

  return path;
}
