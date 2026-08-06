import { ArrowDown as ArrowDownToLine, ArrowUpRight, CurrencyDollar as CircleDollarSign, ArrowsClockwise as RefreshCw } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { useShell } from "../components/AppShell";
import { LoadingPanel, PageHeading, TransactionRow, WalletRow } from "../components/PageParts";
import { Card, CardHeader, Notice, Tabs } from "../components/UI";
import { money } from "../format";
import type { DashboardData, DashboardPeriod } from "../types";

const periods: DashboardPeriod[] = ["1H", "24H", "1W", "1M", "ALL"];

function initialPeriod(): DashboardPeriod {
  const saved = window.localStorage.getItem("momentum:dashboard-period") as DashboardPeriod;
  return periods.includes(saved) ? saved : "24H";
}

export function OverviewPage() {
  const { user } = useAuth();
  const { openAction } = useShell();
  const [data, setData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod>(initialPeriod);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<DashboardData>("/dashboard")
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("momentum:data-changed", load);
    return () => window.removeEventListener("momentum:data-changed", load);
  }, [load]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  }, []);

  const selectPeriod = (nextPeriod: DashboardPeriod) => {
    setPeriod(nextPeriod);
    window.localStorage.setItem("momentum:dashboard-period", nextPeriod);
  };

  return (
    <div className="page-content overview-page">
      <PageHeading
        title={`${greeting}, ${user?.name}`}
        description="Here’s a snapshot of your portfolio."
      />
      {error && <Notice variant="danger">{error}</Notice>}
      {!data ? (
        <LoadingPanel />
      ) : (
        <>
          <section className="balance-card">
            <div className="balance-content">
              <span className="balance-label">Total portfolio value</span>
              <h2>{money(data.total_balance)}</h2>
              <span
                className={`balance-change ${Number(data.periods[period].change) >= 0 ? "positive" : "negative"}`}
                aria-live="polite">
                {Number(data.periods[period].change) >= 0 ? "↑" : "↓"}{" "}
                {Math.abs(Number(data.periods[period].change)).toFixed(2)}% · {period}
              </span>
              <div className="quick-actions">
                <button onClick={() => openAction("receive")}>
                  <span>
                    <ArrowDownToLine size={24} />
                  </span>
                  <strong>Receive</strong>
                </button>
                <button onClick={() => openAction("send")}>
                  <span>
                    <ArrowUpRight size={24} />
                  </span>
                  <strong>Send</strong>
                </button>
                <button onClick={() => openAction("buy")}>
                  <span>
                    <CircleDollarSign size={24} />
                  </span>
                  <strong>Buy</strong>
                </button>
                <button onClick={() => openAction("swap")}>
                  <span>
                    <RefreshCw size={24} />
                  </span>
                  <strong>Swap</strong>
                </button>
              </div>
            </div>
            <BalanceChart key={period} values={data.periods[period].values} />
            <Tabs
              className="period-switcher"
              variant="compact"
              ariaLabel="Portfolio chart period"
              value={period}
              onChange={selectPeriod}
              items={periods.map((item) => ({ value: item, label: item }))}
            />
          </section>
          <div className="overview-grid">
            <Card className="panel-card">
              <CardHeader title="Portfolio" trailing={<span>{data.wallets.length} chains</span>} />
              <div className="panel-list">
                {data.wallets.map((wallet) => (
                  <WalletRow key={wallet.id} wallet={wallet} compact />
                ))}
              </div>
            </Card>
            <Card className="panel-card recent-card">
              <CardHeader title="Recent transactions" trailing={<a href="/app/history">View all</a>} />
              <div className="panel-list">
                {data.transactions.slice(0, 4).map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} compact />
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function BalanceChart({ values }: { values: string[] }) {
  const width = 1200;
  const height = 190;
  const numbers = values.map(Number);
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const points = numbers.map((value, index) => {
    const x = (index / Math.max(1, numbers.length - 1)) * width;
    const y = height - 24 - ((value - min) / Math.max(1, max - min)) * 115;
    return [x, y];
  });
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg
      className="balance-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-label="Portfolio value chart">
      <defs>
        <linearGradient id="chart-line" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#FF8A94" />
          <stop offset="0.5" stopColor="#FF2D3D" />
          <stop offset="1" stopColor="#9F0D20" />
        </linearGradient>
        <linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#FF2D3D" stopOpacity=".35" />
          <stop offset="1" stopColor="#FF2D3D" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#chart-area)" />
      <path
        d={line}
        fill="none"
        stroke="url(#chart-line)"
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
