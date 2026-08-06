import {
  Pulse as Activity,
  ArrowDownLeft,
  ArrowUpRight,
  CaretLeft,
  Check,
  CaretRight as ChevronRight,
  CurrencyDollar as CircleDollarSign,
  Clock as Clock3,
  Copy,
  Headphones,
  SquaresFour as LayoutDashboard,
  SignOut as LogOut,
  List as Menu,
  ChatCircle as MessageCircle,
  MagnifyingGlass as Search,
  PaperPlaneTilt as Send,
  Key,
  Plus,
  Gear as Settings,
  ShieldCheck,
  Sparkle as Sparkles,
  Users,
  Wallet as WalletCards,
  X
} from "@phosphor-icons/react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { Brand } from "../components/Brand";
import { CoinIcon } from "../components/CoinIcon";
import { Modal } from "../components/Modal";
import { assetAmount, money, timeLabel } from "../format";
import { navigate } from "../router";
import type { StaffClient, StaffClientSummary, Wallet } from "../types";

type StaffSummary = {
  clients: number;
  portfolio: string;
  needs_reply: number;
  transactions: number;
};
type DetailTab = "overview" | "chat" | "activity";

const defaultSummary: StaffSummary = {
  clients: 0,
  portfolio: "0",
  needs_reply: 0,
  transactions: 0
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function relativeTime(value: string | null) {
  if (!value) return "No conversation yet";
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(delta / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StaffSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const signOut = async () => {
    await logout();
    navigate("/auth");
  };
  return (
    <>
      {open && (
        <button className="staff-mobile-scrim" onClick={onClose} aria-label="Close navigation" />
      )}
      <aside className={`staff-sidebar ${open ? "open" : ""}`}>
        <div className="staff-brand">
          <Brand />
          <button className="icon-button staff-nav-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <nav className="staff-navigation">
          <a className="active" href="/staff" onClick={(event) => event.preventDefault()}>
            <Users size={19} />
            <span>Clients</span>
          </a>
          <button disabled>
            <LayoutDashboard size={19} />
            <span>Analytics</span>
            <small>Soon</small>
          </button>
          <button disabled>
            <Settings size={19} />
            <span>Workspace</span>
            <small>Soon</small>
          </button>
        </nav>
        <div className="staff-sidebar-note">
          <Headphones size={18} />
          <div>
            <strong>Moderator mode</strong>
            <span>Changes are recorded in client activity.</span>
          </div>
        </div>
        <div className="staff-account">
          <div className="staff-account-meta">
            <span className="staff-avatar small">{initials(user?.name || "MO")}</span>
            <div>
              <strong>{user?.name}</strong>
              <span>Moderator</span>
            </div>
          </div>
          <button className="icon-button" onClick={signOut} aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
    </>
  );
}

function AdjustBalanceModal({
  client,
  wallet,
  onClose,
  onSaved
}: {
  client: StaffClient;
  wallet: Wallet;
  onClose: () => void;
  onSaved: (client: StaffClient) => void;
}) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ client: StaffClient }>(`/staff/clients/${client.id}/balance`, {
        method: "POST",
        body: JSON.stringify({ asset: wallet.symbol, action: "credit", amount })
      });
      onSaved(result.client);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Adjust client balance" onClose={onClose}>
      <form className="modal-body staff-adjust-form" onSubmit={submit}>
        <div className="staff-adjust-client">
          <span className="staff-avatar">{initials(client.name)}</span>
          <div>
            <span>Client</span>
            <strong>{client.name}</strong>
          </div>
          <ChevronRight size={18} />
          <CoinIcon symbol={wallet.symbol} size="sm" />
          <div>
            <span>Asset</span>
            <strong>{wallet.symbol}</strong>
          </div>
        </div>
        <div className="adjust-warning">
          <ShieldCheck size={18} />
          <p>
            This creates an auditable credit transaction. Moderator accounts cannot debit clients.
          </p>
        </div>
        <div className="staff-segmented"><button type="button" className="active"><ArrowDownLeft size={16} /> Credit only</button></div>
        <label className="field-label">
          Amount in {wallet.symbol}
          <div className="amount-field">
            <input
              className="field-input"
              type="number"
              step="any"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              autoFocus
              required
            />
            <span>{wallet.symbol}</span>
          </div>
          <small>Current balance: {assetAmount(wallet.balance, wallet.symbol)}</small>
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !Number(amount)}>
            {busy ? "Applying…" : "Apply credit"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CreateClientModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: (client: StaffClient, password: string) => void;
}) {
  const [profileLabel, setProfileLabel] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [requiredCodes, setRequiredCodes] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ client: StaffClient; temporary_password: string }>(
        "/staff/clients",
        {
          method: "POST",
          body: JSON.stringify({
            profile_label: profileLabel,
            name,
            username: username || null,
            email: email || null,
            required_codes: requiredCodes
          })
        }
      );
      onCreated(result.client, result.temporary_password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Create client profile" onClose={onClose}>
      <form className="modal-body space-y-4" onSubmit={submit}>
        <label className="field-label">Profile label<input className="field-input" value={profileLabel} onChange={(event) => setProfileLabel(event.target.value)} placeholder="Olena · campaign 1" autoFocus required /></label>
        <label className="field-label">Client name<input className="field-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Olena" required /></label>
        <label className="field-label">Username (optional)<input className="field-input" value={username} onChange={(event) => setUsername(event.target.value.replace(/[^A-Za-z0-9_]/g, ""))} placeholder="Generated automatically" /></label>
        <label className="field-label">Email (optional)<input className="field-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Generated local address" /></label>
        <label className="field-label">Required confirmation codes<input className="field-input" type="number" min="0" max="1000" value={requiredCodes} onChange={(event) => setRequiredCodes(Math.min(1000, Math.max(0, Number(event.target.value))))} /></label>
        <p className="fine-print">A temporary password and the requested one-time codes are generated securely. The password is shown once.</p>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Creating…" : "Create profile"}</button></div>
      </form>
    </Modal>
  );
}

function TemporaryPasswordModal({
  username,
  password,
  onClose
}: {
  username: string;
  password: string;
  onClose: () => void;
}) {
  const copy = async () => navigator.clipboard.writeText(`Login: ${username}\nPassword: ${password}`);
  return (
    <Modal title="Temporary credentials" onClose={onClose}>
      <div className="modal-body space-y-4">
        <div className="adjust-warning"><ShieldCheck size={18} /><p>This password is shown only once. Copy it before closing this window.</p></div>
        <dl className="credential-card"><div><dt>Login</dt><dd>{username}</dd></div><div><dt>Temporary password</dt><dd>{password}</dd></div></dl>
        <button className="button primary w-full" onClick={copy}><Copy size={16} /> Copy login and password</button>
      </div>
    </Modal>
  );
}

function ClientOverview({
  client,
  onAdjust,
  onRefresh,
  notify,
  onTemporaryPassword
}: {
  client: StaffClient;
  onAdjust: (wallet: Wallet) => void;
  onRefresh: () => void;
  notify: (message: string) => void;
  onTemporaryPassword: (password: string) => void;
}) {
  const [codeCount, setCodeCount] = useState(3);
  const [requiredCodes, setRequiredCodes] = useState(client.verification_required);
  const [codePage, setCodePage] = useState(1);
  const [codesPerPage, setCodesPerPage] = useState(10);
  const [busy, setBusy] = useState(false);
  useEffect(() => setRequiredCodes(client.verification_required), [client.verification_required]);
  useEffect(() => setCodePage(1), [client.id]);
  const generate = async () => {
    setBusy(true);
    try {
      await api(`/staff/clients/${client.id}/codes`, {
        method: "POST",
        body: JSON.stringify({ count: codeCount })
      });
      await onRefresh();
      setCodePage(1);
      notify(`${codeCount} confirmation ${codeCount === 1 ? "code" : "codes"} generated`);
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    setBusy(true);
    try {
      await api(`/staff/clients/${client.id}/codes`, { method: "DELETE" });
      await onRefresh();
      notify("Confirmation codes cleared");
    } finally {
      setBusy(false);
    }
  };
  const updateRequired = async () => {
    setBusy(true);
    try {
      await api(`/staff/clients/${client.id}/verification`, {
        method: "PATCH",
        body: JSON.stringify({ required_codes: requiredCodes })
      });
      await onRefresh();
      notify("Required code count updated");
    } finally {
      setBusy(false);
    }
  };
  const resetPassword = async () => {
    setBusy(true);
    try {
      const result = await api<{ temporary_password: string }>(
        `/staff/clients/${client.id}/reset-password`,
        { method: "POST" }
      );
      onTemporaryPassword(result.temporary_password);
    } finally {
      setBusy(false);
    }
  };
  const readyCodes = client.codes.filter((item) => item.status === "ready").length;
  const nextReadyId = client.codes
    .filter((item) => item.status === "ready")
    .sort((left, right) => left.id - right.id)[0]?.id;
  const codePageCount = Math.max(1, Math.ceil(client.codes.length / codesPerPage));
  const currentCodePage = Math.min(codePage, codePageCount);
  const visibleCodes = client.codes.slice(
    (currentCodePage - 1) * codesPerPage,
    currentCodePage * codesPerPage
  );
  const codePageItems = useMemo<(number | string)[]>(() => {
    if (codePageCount <= 7) {
      return Array.from({ length: codePageCount }, (_, index) => index + 1);
    }
    const pages = Array.from(
      new Set([1, codePageCount, currentCodePage - 1, currentCodePage, currentCodePage + 1])
    )
      .filter((page) => page >= 1 && page <= codePageCount)
      .sort((left, right) => left - right);
    const items: (number | string)[] = [];
    pages.forEach((page, index) => {
      if (index > 0 && page - pages[index - 1] > 1) items.push(`ellipsis-${page}`);
      items.push(page);
    });
    return items;
  }, [codePageCount, currentCodePage]);
  useEffect(() => {
    if (codePage > codePageCount) setCodePage(codePageCount);
  }, [codePage, codePageCount]);
  return (
    <div className="staff-overview-grid">
      <div className="staff-overview-main">
        <section className="staff-section-card profile-summary">
          <div className="staff-section-title">
            <div>
              <h3>Client profile</h3>
            </div>
            <span className="status-pill">
              <i /> Active
            </span>
          </div>
          <dl>
            <div><dt>Profile label</dt><dd>{client.profile_label}</dd></div>
            <div>
              <dt>Username</dt>
              <dd>@{client.username}</dd>
            </div>
            <div>
              <dt>Email address</dt>
              <dd>{client.email}</dd>
            </div>
            <div>
              <dt>Client since</dt>
              <dd>
                {new Date(client.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric"
                })}
              </dd>
            </div>
            <div>
              <dt>Client ID</dt>
              <dd>#{client.id.toString().padStart(5, "0")}</dd>
            </div>
          </dl>
          <div className="profile-actions"><button className="button secondary small" onClick={resetPassword} disabled={busy}><Key size={16} /> Reset temporary password</button></div>
        </section>
        <section className="staff-section-card code-manager">
          <div className="staff-section-title">
            <div>
              <h3>Confirmation codes</h3>
            </div>
            <span className="neutral-pill">{readyCodes} ready</span>
          </div>
          <p>
            Progress: {client.verification_used} of {client.verification_required} used · state: {client.verification_state}.
          </p>
          <div className="code-controls">
            <label>
              <span>Quantity</span>
              <input
                type="number"
                min="1"
                max="1000"
                value={codeCount}
                onChange={(event) =>
                  setCodeCount(Math.min(1000, Math.max(1, Number(event.target.value))))
                }
              />
            </label>
            <button className="button primary small" onClick={generate} disabled={busy}>
              <Sparkles size={16} /> Generate
            </button>
            {client.codes.length > 0 && (
              <button className="button secondary small" onClick={clear} disabled={busy}>
                Clear all
              </button>
            )}
          </div>
          <div className="code-controls verification-target-control">
            <label><span>Required total</span><input type="number" min={client.verification_used} max="1000" value={requiredCodes} onChange={(event) => setRequiredCodes(Math.min(1000, Math.max(client.verification_used, Number(event.target.value))))} /></label>
            <button className="button secondary small" onClick={updateRequired} disabled={busy || requiredCodes === client.verification_required}>Save requirement</button>
          </div>
          <div className="code-list">
            {client.codes.length === 0 ? (
              <div className="codes-empty">
                <ShieldCheck size={20} />
                <span>No active codes</span>
              </div>
            ) : (
              visibleCodes.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    navigator.clipboard.writeText(item.code);
                    notify("Code copied");
                  }}>
                  <span>
                    <small>{item.status === "used" ? "Used" : item.id === nextReadyId ? "Next" : "Queued"}</small>
                    <strong>{item.code}</strong>
                  </span>
                  <Copy size={15} />
                </button>
              ))
            )}
          </div>
          {client.codes.length > 0 && (
            <div className="code-pagination">
              <label className="code-page-size">
                <span>Show</span>
                <select
                  value={codesPerPage}
                  onChange={(event) => {
                    setCodesPerPage(Number(event.target.value));
                    setCodePage(1);
                  }}>
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                </select>
              </label>
              <span className="code-page-summary">
                {(currentCodePage - 1) * codesPerPage + 1}–{Math.min(currentCodePage * codesPerPage, client.codes.length)} of {client.codes.length}
              </span>
              <nav className="code-page-nav" aria-label="Confirmation codes pages">
                <button
                  type="button"
                  aria-label="Previous codes page"
                  disabled={currentCodePage === 1}
                  onClick={() => setCodePage((page) => Math.max(1, page - 1))}>
                  <CaretLeft size={14} />
                </button>
                {codePageItems.map((item) =>
                  typeof item === "number" ? (
                    <button
                      type="button"
                      key={item}
                      className={item === currentCodePage ? "active" : ""}
                      aria-current={item === currentCodePage ? "page" : undefined}
                      onClick={() => setCodePage(item)}>
                      {item}
                    </button>
                  ) : (
                    <span key={item}>…</span>
                  )
                )}
                <button
                  type="button"
                  aria-label="Next codes page"
                  disabled={currentCodePage === codePageCount}
                  onClick={() => setCodePage((page) => Math.min(codePageCount, page + 1))}>
                  <ChevronRight size={14} />
                </button>
              </nav>
            </div>
          )}
        </section>
      </div>
      <section className="staff-section-card wallet-manager">
        <div className="staff-section-title">
          <div>
            <h3>Wallets & balances</h3>
          </div>
          <strong>{money(client.total_balance)}</strong>
        </div>
        <div className="staff-wallet-list">
          {client.wallets.map((wallet) => (
            <article key={wallet.id}>
              <CoinIcon symbol={wallet.symbol} size="sm" />
              <div className="staff-wallet-name">
                <strong>{wallet.name}</strong>
                <span>
                  {wallet.symbol} · {wallet.network}
                </span>
              </div>
              <div className="staff-wallet-balance">
                <strong>{assetAmount(wallet.balance, wallet.symbol)}</strong>
                <span>{money(wallet.usd_value)}</span>
              </div>
              <button className="button secondary small" onClick={() => onAdjust(wallet)}>
                Adjust
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ClientChat({
  client,
  onRefresh
}: {
  client: StaffClient;
  onRefresh: () => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [client.messages]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api(`/staff/clients/${client.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: body.trim() })
      });
      setBody("");
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="staff-chat-panel">
      <div className="staff-chat-context">
        <MessageCircle size={17} />
        <span>
          Conversation with <strong>{client.name}</strong>
        </span>
        <span className="status-pill">
          <i /> Client
        </span>
      </div>
      <div className="staff-chat-messages" ref={chatRef}>
        {client.messages.map((message) => (
          <div className={`staff-chat-row ${message.sender}`} key={message.id}>
            <div>
              <p>{message.body}</p>
              <time>{timeLabel(message.created_at)}</time>
            </div>
          </div>
        ))}
      </div>
      <form className="staff-chat-composer" onSubmit={submit}>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a clear, helpful reply…"
          rows={2}
        />
        <button className="button primary" disabled={busy || !body.trim()}>
          <Send size={17} /> Send reply
        </button>
      </form>
    </section>
  );
}

function ClientActivity({ client }: { client: StaffClient }) {
  return (
    <section className="staff-section-card staff-activity">
      <div className="staff-section-title">
        <div>
          <h3>Recent activity</h3>
        </div>
        <span className="neutral-pill">{client.transaction_count} total</span>
      </div>
      <div>
        {client.transactions.map((item) => {
          const incoming = Number(item.amount) >= 0;
          return (
            <article key={item.id}>
              <span className={`activity-icon ${incoming ? "incoming" : "outgoing"}`}>
                {incoming ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
              </span>
              <div>
                <strong>{item.title}</strong>
                <span>
                  {new Date(item.created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </span>
              </div>
              <div>
                <strong>
                  {incoming ? "+" : "−"}
                  {assetAmount(item.amount, item.asset)}
                </strong>
                <span>{money(item.usd_value)}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function StaffPage() {
  const [clients, setClients] = useState<StaffClientSummary[]>([]);
  const [summary, setSummary] = useState<StaffSummary>(defaultSummary);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [client, setClient] = useState<StaffClient | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<DetailTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [adjustWallet, setAdjustWallet] = useState<Wallet | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [toast, setToast] = useState("");

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };
  const loadClients = useCallback(async (search = "") => {
    const result = await api<{ items: StaffClientSummary[]; summary: StaffSummary }>(
      `/staff/clients${search ? `?query=${encodeURIComponent(search)}` : ""}`
    );
    setClients(result.items);
    setSummary(result.summary);
    setSelectedId((current) =>
      current && result.items.some((item) => item.id === current)
        ? current
        : result.items[0]?.id || null
    );
  }, []);
  const loadClient = useCallback(async () => {
    if (!selectedId) {
      setClient(null);
      return;
    }
    const result = await api<{ client: StaffClient }>(`/staff/clients/${selectedId}`);
    setClient(result.client);
  }, [selectedId]);
  useEffect(() => {
    loadClients()
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [loadClients]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => loadClients(query).catch((err) => setError((err as Error).message)),
      240
    );
    return () => window.clearTimeout(timer);
  }, [query, loadClients]);
  useEffect(() => {
    loadClient().catch((err) => setError((err as Error).message));
  }, [loadClient]);
  const refreshAll = useCallback(async () => {
    await Promise.all([loadClient(), loadClients(query)]);
  }, [loadClient, loadClients, query]);
  const currentIndex = useMemo(
    () => clients.findIndex((item) => item.id === selectedId),
    [clients, selectedId]
  );

  return (
    <div className="staff-shell">
      <StaffSidebar open={mobileNav} onClose={() => setMobileNav(false)} />
      <main className="staff-main">
        <header className="staff-mobile-header">
          <Brand compact />
          <button className="icon-button" onClick={() => setMobileNav(true)}>
            <Menu />
          </button>
        </header>
        <div className="staff-page">
          <section className="staff-kpis">
            <article>
              <span className="kpi-icon">
                <Users />
              </span>
              <div>
                <small>Total clients</small>
                <strong>{summary.clients}</strong>
              </div>
              <em>Active accounts</em>
            </article>
            <article>
              <span className="kpi-icon">
                <CircleDollarSign />
              </span>
              <div>
                <small>Managed portfolio</small>
                <strong>{money(summary.portfolio, 0)}</strong>
              </div>
              <em>Across all wallets</em>
            </article>
            <article>
              <span className="kpi-icon">
                <MessageCircle />
              </span>
              <div>
                <small>Needs reply</small>
                <strong>{summary.needs_reply}</strong>
              </div>
              <em className={summary.needs_reply ? "attention" : ""}>
                {summary.needs_reply ? "Action required" : "Inbox clear"}
              </em>
            </article>
            <article>
              <span className="kpi-icon">
                <Activity />
              </span>
              <div>
                <small>Transactions</small>
                <strong>{summary.transactions}</strong>
              </div>
              <em>Recorded events</em>
            </article>
          </section>
          {error && <div className="form-error staff-error">{error}</div>}
          <section className="staff-workspace">
            <aside className="client-list-panel">
              <div className="client-list-heading">
                <div>
                  <h2>Clients</h2>
                  <button className="button primary small" onClick={() => setCreateOpen(true)}><Plus size={15} /> New</button>
                </div>
                <div className="staff-search">
                  <Search size={17} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search label, ID, name, email, username…"
                  />
                </div>
              </div>
              <div className="client-list">
                {loading ? (
                  <div className="client-list-empty">Loading clients…</div>
                ) : clients.length === 0 ? (
                  <div className="client-list-empty">No clients match your search.</div>
                ) : (
                  clients.map((item, index) => (
                    <button
                      className={item.id === selectedId ? "active" : ""}
                      key={item.id}
                      onClick={() => {
                        setSelectedId(item.id);
                        setTab("overview");
                      }}>
                      <span className="staff-avatar">{initials(item.name)}</span>
                      <span className="client-card-copy">
                        <strong>{item.profile_label}</strong>
                        <small>
                          {item.name} · @{item.username} · {relativeTime(item.last_message_at)}
                        </small>
                      </span>
                      <span className="client-card-value">
                        <strong>{money(item.total_balance, 0)}</strong>
                        {item.needs_reply ? (
                          <small className="reply-dot">
                            <i /> Reply
                          </small>
                        ) : (
                          <small>{item.transaction_count} txns</small>
                        )}
                      </span>
                      <span className="client-number">{String(index + 1).padStart(2, "0")}</span>
                    </button>
                  ))
                )}
              </div>
            </aside>
            <div className="client-detail-panel">
              {!client ? (
                <div className="client-detail-empty">
                  <Users size={30} />
                  <h3>Select a client</h3>
                  <p>Choose an account from the list to open its workspace.</p>
                </div>
              ) : (
                <>
                  <header className="client-detail-header">
                    <div className="client-title">
                      <span className="staff-avatar large">{initials(client.name)}</span>
                      <div>
                        <div>
                          <h2>{client.profile_label}</h2>
                          <span className="status-pill">
                            <i /> Active
                          </span>
                        </div>
                        <p>
                          {client.name} · @{client.username} · {client.email}
                        </p>
                      </div>
                    </div>
                    <div className="client-position">
                      <span>
                        {currentIndex + 1} of {clients.length}
                      </span>
                      <strong>{money(client.total_balance)}</strong>
                    </div>
                  </header>
                  <nav className="client-tabs">
                    <button
                      className={tab === "overview" ? "active" : ""}
                      onClick={() => setTab("overview")}>
                      <WalletCards size={16} /> Overview
                    </button>
                    <button
                      className={tab === "chat" ? "active" : ""}
                      onClick={() => setTab("chat")}>
                      <MessageCircle size={16} /> Conversation{client.needs_reply && <i />}
                    </button>
                    <button
                      className={tab === "activity" ? "active" : ""}
                      onClick={() => setTab("activity")}>
                      <Clock3 size={16} /> Activity
                    </button>
                  </nav>
                  <div className="client-detail-body">
                    {tab === "overview" && (
                      <ClientOverview
                        client={client}
                        onAdjust={setAdjustWallet}
                        onRefresh={refreshAll}
                        notify={notify}
                        onTemporaryPassword={(password) => setCredentials({ username: client.username, password })}
                      />
                    )}
                    {tab === "chat" && <ClientChat client={client} onRefresh={refreshAll} />}
                    {tab === "activity" && <ClientActivity client={client} />}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </main>
      {adjustWallet && client && (
        <AdjustBalanceModal
          client={client}
          wallet={adjustWallet}
          onClose={() => setAdjustWallet(null)}
          onSaved={(updated) => {
            setClient(updated);
            setAdjustWallet(null);
            loadClients(query);
            notify(`${adjustWallet.symbol} balance updated`);
          }}
        />
      )}
      {createOpen && (
        <CreateClientModal
          onClose={() => setCreateOpen(false)}
          onCreated={(created, password) => {
            setCreateOpen(false);
            setClient(created);
            setSelectedId(created.id);
            setCredentials({ username: created.username, password });
            loadClients(query);
          }}
        />
      )}
      {credentials && <TemporaryPasswordModal username={credentials.username} password={credentials.password} onClose={() => setCredentials(null)} />}
      {toast && (
        <div className="staff-toast">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
