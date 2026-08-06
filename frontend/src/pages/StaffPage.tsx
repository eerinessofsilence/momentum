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
  SquaresFour as LayoutDashboard,
  SignOut as LogOut,
  List as Menu,
  ChatCircle as MessageCircle,
  MagnifyingGlass as Search,
  PaperPlaneTilt as Send,
  Key,
  Password,
  Plus,
  Gear as Settings,
  ShieldCheck,
  SignIn,
  Trash,
  Users,
  Wallet as WalletCards,
  X
} from "@phosphor-icons/react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { copyToClipboard } from "../clipboard";
import { Brand } from "../components/Brand";
import { CoinIcon } from "../components/CoinIcon";
import { Modal } from "../components/Modal";
import { CustomSelect } from "../components/CustomSelect";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Notice,
  Tabs,
  Textarea
} from "../components/UI";
import { assetAmount, money, timeLabel } from "../format";
import { navigate } from "../router";
import type {
  ConfirmationCode,
  ProfileStatus,
  StaffClient,
  StaffClientSummary,
  Wallet
} from "../types";

type StaffSummary = {
  clients: number;
  portfolio: string;
  needs_reply: number;
  transactions: number;
};
type StaffPagination = {
  page: number;
  page_size: number;
  total: number;
  pages: number;
};
type DetailTab = "overview" | "chat" | "activity";

const defaultSummary: StaffSummary = {
  clients: 0,
  portfolio: "0",
  needs_reply: 0,
  transactions: 0
};
const defaultPagination: StaffPagination = { page: 1, page_size: 25, total: 0, pages: 1 };

const profileStatusMeta: Record<
  ProfileStatus,
  { label: string; variant: "success" | "warning" | "neutral" }
> = {
  active: { label: "Active", variant: "success" },
  suspended: { label: "Suspended", variant: "warning" },
  archived: { label: "Archived", variant: "neutral" }
};

function ProfileStatusBadge({ status }: { status: ProfileStatus }) {
  const meta = profileStatusMeta[status];
  return (
    <Badge variant={meta.variant} dot>
      {meta.label}
    </Badge>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Splits a code into groups of three for display only — the raw value is what
 * gets copied. Moderators read these out loud, and grouped digits are markedly
 * harder to misread or lose your place in than an unbroken run.
 */
function groupDigits(code: string) {
  return code.replace(/(.{3})(?=.)/g, "$1 ");
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
            <Users size={20} />
            <span>Clients</span>
          </a>
          <button disabled>
            <LayoutDashboard size={20} />
            <span>Analytics</span>
            <small>Soon</small>
          </button>
          <button disabled>
            <Settings size={20} />
            <span>Workspace</span>
            <small>Soon</small>
          </button>
        </nav>
        <div className="staff-account">
          <div className="staff-account-meta">
            <span className="staff-avatar small">{initials(user?.name || "MO")}</span>
            <div>
              <strong>{user?.name}</strong>
              <span>Moderator</span>
            </div>
          </div>
          <button className="icon-button" onClick={signOut} aria-label="Sign out">
            <LogOut size={20} />
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
      {(close) => (
        <form className="modal-body staff-adjust-form" onSubmit={submit}>
          <div className="staff-adjust-client">
            <div className="staff-adjust-party">
              <span className="staff-avatar">{initials(client.name)}</span>
              <div>
                <span>Client</span>
                <strong>{client.name}</strong>
              </div>
            </div>
            <ChevronRight size={20} />
            <div className="staff-adjust-party">
              <CoinIcon symbol={wallet.symbol} size="sm" />
              <div>
                <span>Asset</span>
                <strong>{wallet.symbol}</strong>
              </div>
            </div>
          </div>
          <Field
            label={`Amount in ${wallet.symbol}`}
            hint={`Current balance: ${assetAmount(wallet.balance, wallet.symbol)}`}>
            <div className="amount-field">
              <Input
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
          </Field>
          {error && <Notice variant="danger">{error}</Notice>}
          <div className="modal-actions">
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy || !Number(amount)}>
              {busy ? "Applying…" : "Apply credit"}
            </Button>
          </div>
        </form>
      )}
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
            name,
            username,
            email,
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
      {(close) => (
        <form className="modal-body space-y-4" onSubmit={submit}>
          <Field label="Client name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter the client's full name"
              autoFocus
              required
            />
          </Field>
          <Field label="Username" hint="Shown as @username">
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
              placeholder="e.g. mia_warren"
              required
            />
          </Field>
          <Field label="Email" hint="Required contact email">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="mia.warren@example.com"
              required
            />
          </Field>
          <Field label="Required confirmation codes">
            <Input
              type="number"
              min="0"
              max="1000"
              value={requiredCodes}
              onChange={(event) =>
                setRequiredCodes(Math.min(1000, Math.max(0, Number(event.target.value))))
              }
            />
          </Field>
          <p className="fine-print">
            A temporary password and the requested one-time codes are generated securely. The
            password is shown once.
          </p>
          {error && <Notice variant="danger">{error}</Notice>}
          <div className="modal-actions">
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Creating…" : "Create profile"}
            </Button>
          </div>
        </form>
      )}
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
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyToClipboard(`Login: ${username}\nPassword: ${password}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };
  return (
    <Modal title="Temporary credentials" onClose={onClose}>
      <div className="modal-body space-y-4">
        <Notice variant="warning" icon={<ShieldCheck size={20} />} className="adjust-warning">
          <p>This password is shown only once. Copy it before closing this window.</p>
        </Notice>
        <dl className="credential-card">
          <div>
            <dt>Login</dt>
            <dd>{username}</dd>
          </div>
          <div>
            <dt>Temporary password</dt>
            <dd>{password}</dd>
          </div>
        </dl>
        <Button variant="primary" className="w-full" onClick={copy}>
          {copied ? (
            <>
              <Check size={16} /> Copied
            </>
          ) : (
            <>
              <Copy size={16} /> Copy login and password
            </>
          )}
        </Button>
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
  const [showAllCodes, setShowAllCodes] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<number | null>(null);
  const copyResetTimer = useRef<number>();
  const [busy, setBusy] = useState(false);
  useEffect(() => setRequiredCodes(client.verification_required), [client.verification_required]);
  useEffect(() => setShowAllCodes(false), [client.id]);
  useEffect(() => () => window.clearTimeout(copyResetTimer.current), []);
  // Confirmation lands on the tile the moderator clicked rather than in the
  // toast at the bottom of the screen — they are reading the code, not the
  // corner of the window.
  const copyCode = async (item: ConfirmationCode) => {
    try {
      await copyToClipboard(item.code);
      window.clearTimeout(copyResetTimer.current);
      setCopiedCodeId(item.id);
      copyResetTimer.current = window.setTimeout(() => setCopiedCodeId(null), 1800);
    } catch {
      notify("Couldn't copy the code. Please copy it manually.");
    }
  };
  const generate = async () => {
    setBusy(true);
    try {
      await api(`/staff/clients/${client.id}/codes`, {
        method: "POST",
        body: JSON.stringify({ count: codeCount })
      });
      await onRefresh();
      notify(`${codeCount} confirmation ${codeCount === 1 ? "code" : "codes"} generated`);
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    if (
      !window.confirm("Clear all confirmation codes for this client? This action cannot be undone.")
    ) {
      return;
    }
    setBusy(true);
    try {
      await api(`/staff/clients/${client.id}/codes`, { method: "DELETE" });
      await onRefresh();
      notify("Confirmation codes cleared");
    } finally {
      setBusy(false);
    }
  };
  // Committed on blur as well as on Enter: the previous version only applied
  // the number through a button that appeared when it differed, so editing the
  // field and moving on discarded the change without saying anything.
  const commitRequired = async () => {
    if (busy || requiredCodes === client.verification_required) return;
    setBusy(true);
    try {
      await api(`/staff/clients/${client.id}/verification`, {
        method: "PATCH",
        body: JSON.stringify({ required_codes: requiredCodes })
      });
      await onRefresh();
      notify(
        requiredCodes === 0
          ? "Confirmation turned off"
          : `Client now needs ${requiredCodes} ${requiredCodes === 1 ? "code" : "codes"}`
      );
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
  const updateProfileStatus = async (nextStatus: ProfileStatus) => {
    if (nextStatus === client.account_status) return;
    if (
      nextStatus !== "active" &&
      !window.confirm(
        `${profileStatusMeta[nextStatus].label} this profile? The client will be signed out and unable to sign in.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api(`/staff/clients/${client.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });
      await onRefresh();
      notify(`Profile status changed to ${profileStatusMeta[nextStatus].label}`);
    } finally {
      setBusy(false);
    }
  };
  const readyCodes = client.codes.filter((item) => item.status === "ready").length;
  const verificationConfigured = client.verification_required > 0;
  const verificationComplete =
    verificationConfigured && client.verification_used >= client.verification_required;
  const requirementDirty = requiredCodes !== client.verification_required;
  // One sentence for the state instead of the three the card used to carry
  // (a status line, a hint under the field, and the number in the field).
  const verificationHeadline = !verificationConfigured
    ? "Confirmation is off"
    : verificationComplete
      ? "Verification complete"
      : `${client.verification_used} of ${client.verification_required} codes entered`;
  const verificationHint = !verificationConfigured
    ? "Codes exist but the client is never asked for them. Set a requirement to start."
    : verificationComplete
      ? "The client has entered every code this transfer needs."
      : `${client.verification_required - client.verification_used} to go before the transfer completes.`;
  // The first unused code is the one the moderator reads out; everything after
  // it is a queue, and used codes are history.
  const nextCode = client.codes.find((item) => item.status === "ready");
  const queuedCodes = client.codes.filter((item) => item.id !== nextCode?.id);
  const collapsedCodes = queuedCodes.slice(0, 6);
  const visibleQueue = showAllCodes ? queuedCodes : collapsedCodes;
  return (
    <div className="staff-overview-grid">
      <div className="staff-overview-main">
        <Card variant="nested" className="staff-section-card code-manager">
          <CardHeader
            level={3}
            className="staff-section-title"
            title="Confirmation codes"
            trailing={
              <>
                <Badge>{readyCodes} unused</Badge>
                {client.codes.length > 0 && (
                  <Button
                    variant="ghost"
                    size="small"
                    className="icon-button code-clear"
                    onClick={clear}
                    disabled={busy}
                    aria-label="Clear all codes"
                    title="Clear all codes">
                    <Trash size={16} />
                  </Button>
                )}
              </>
            }
          />
          <div className="code-state">
            <div className="code-state__copy">
              <strong>{verificationHeadline}</strong>
              <span>{verificationHint}</span>
            </div>
            <label className="code-requirement">
              <span>Codes required</span>
              <Input
                controlSize="small"
                type="number"
                min={client.verification_used}
                max="1000"
                value={requiredCodes}
                disabled={busy}
                aria-describedby={requirementDirty ? "code-requirement-hint" : undefined}
                onChange={(event) =>
                  setRequiredCodes(
                    Math.min(1000, Math.max(client.verification_used, Number(event.target.value)))
                  )
                }
                onBlur={commitRequired}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRequired();
                  }
                  if (event.key === "Escape") setRequiredCodes(client.verification_required);
                }}
              />
            </label>
            {verificationConfigured && (
              <progress
                value={client.verification_used}
                max={client.verification_required}
                aria-label="Codes entered"
              />
            )}
            {requirementDirty && (
              <span className="code-requirement__hint" id="code-requirement-hint" role="status">
                Not saved yet — press Enter or click away to apply.
              </span>
            )}
          </div>
          {nextCode ? (
            <div className="code-next">
              <div className="code-next__copy">
                <strong>{groupDigits(nextCode.code)}</strong>
              </div>
              <Button
                size="small"
                onClick={() => copyCode(nextCode)}
                aria-label={`Copy next code ${nextCode.code}`}>
                {copiedCodeId === nextCode.id ? (
                  <>
                    <Check size={16} /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={16} /> Copy
                  </>
                )}
              </Button>
            </div>
          ) : (
            <EmptyState
              compact
              className="codes-empty"
              icon={<ShieldCheck size={20} />}
              title={client.codes.length ? "Every code has been used" : "No codes yet"}
            />
          )}
          {queuedCodes.length > 0 && (
            <div className={`code-queue ${showAllCodes ? "is-expanded" : ""}`}>
              {visibleQueue.map((item) =>
                item.status === "used" ? (
                  <span className="code-chip is-used" key={item.id}>
                    <strong>{groupDigits(item.code)}</strong>
                    <small>Used</small>
                  </span>
                ) : (
                  <button
                    className="code-chip"
                    key={item.id}
                    type="button"
                    aria-label={`Copy code ${item.code}`}
                    title="Copy code"
                    onClick={() => copyCode(item)}>
                    <strong>{groupDigits(item.code)}</strong>
                    {copiedCodeId === item.id ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                )
              )}
            </div>
          )}
          {/* One-time codes are a queue, not a table: the moderator needs the
              next one, so the rest collapses instead of paginating. */}
          <div className="code-footer">
            {queuedCodes.length > collapsedCodes.length || showAllCodes ? (
              <Button
                variant="ghost"
                size="small"
                className="code-more"
                onClick={() => setShowAllCodes((current) => !current)}
                aria-expanded={showAllCodes}>
                {showAllCodes ? "Show fewer" : `Show all ${queuedCodes.length}`}
              </Button>
            ) : (
              <span />
            )}
            <div className="code-generate">
              <Button variant="primary" size="small" onClick={generate} disabled={busy}>
                <Password size={16} /> Generate
              </Button>
              <Input
                controlSize="small"
                type="number"
                min="1"
                max="1000"
                value={codeCount}
                disabled={busy}
                aria-label="Number of codes to generate"
                onChange={(event) =>
                  setCodeCount(Math.min(1000, Math.max(1, Number(event.target.value))))
                }
              />
              <span>{codeCount === 1 ? "code" : "codes"}</span>
            </div>
          </div>
        </Card>
        <Card variant="nested" className="staff-section-card profile-summary">
          <CardHeader
            level={3}
            className="staff-section-title"
            title="Client profile"
            trailing={<ProfileStatusBadge status={client.account_status} />}
          />
          <dl>
            <div>
              <dt>Client name</dt>
              <dd>{client.name}</dd>
            </div>
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
          <div className="profile-actions">
            <label className="profile-status-control">
              <span>Profile status</span>
              <CustomSelect
                controlSize="small"
                value={client.account_status}
                ariaLabel="Profile status"
                disabled={busy}
                className="profile-status-select"
                options={[
                  { value: "active", label: "Active" },
                  { value: "suspended", label: "Suspended" },
                  { value: "archived", label: "Archived" }
                ]}
                onChange={(value) => updateProfileStatus(value as ProfileStatus)}
              />
            </label>
            <Button size="small" onClick={resetPassword} disabled={busy}>
              <Key size={16} /> Reset temporary password
            </Button>
          </div>
        </Card>
      </div>
      <Card variant="nested" className="staff-section-card wallet-manager">
        <CardHeader
          level={3}
          className="staff-section-title"
          title="Wallets & balances"
          trailing={<strong>{money(client.total_balance)}</strong>}
        />
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
              <Button size="small" onClick={() => onAdjust(wallet)}>
                Adjust
              </Button>
            </article>
          ))}
        </div>
      </Card>
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
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [client.messages]);
  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = "auto";
    composer.style.height = `${Math.min(composer.scrollHeight, 128)}px`;
  }, [body]);
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
    <Card variant="nested" className="staff-chat-panel">
      <div className="staff-chat-context">
        <MessageCircle size={16} />
        <span>
          Conversation with <strong>{client.name}</strong>
        </span>
        <Badge variant="success" dot>
          Client
        </Badge>
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
        <Textarea
          ref={composerRef}
          controlSize="regular"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends the reply; Shift+Enter keeps the native textarea
            // behavior and adds a new line for longer, structured messages.
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (body.trim() && !busy) event.currentTarget.form?.requestSubmit();
          }}
          placeholder="Write a clear, helpful reply…"
          rows={1}
        />
        <Button type="submit" variant="primary" disabled={busy || !body.trim()}>
          <Send size={16} /> Send reply
        </Button>
      </form>
    </Card>
  );
}

function ClientActivity({ client }: { client: StaffClient }) {
  return (
    <Card variant="nested" className="staff-section-card staff-activity">
      <CardHeader
        level={3}
        className="staff-section-title"
        title="Recent activity"
        trailing={<Badge>{client.transaction_count} total</Badge>}
      />
      <div>
        {client.transactions.map((item) => {
          const incoming = Number(item.amount) >= 0;
          return (
            <article key={item.id}>
              <span className={`activity-icon ${incoming ? "incoming" : "outgoing"}`}>
                {incoming ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
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
    </Card>
  );
}

export function StaffPage() {
  const { openClientProfile } = useAuth();
  const [clients, setClients] = useState<StaffClientSummary[]>([]);
  const [summary, setSummary] = useState<StaffSummary>(defaultSummary);
  const [pagination, setPagination] = useState<StaffPagination>(defaultPagination);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [client, setClient] = useState<StaffClient | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<DetailTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [openingClient, setOpeningClient] = useState(false);
  const [adjustWallet, setAdjustWallet] = useState<Wallet | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(
    null
  );
  const [toast, setToast] = useState<{ message: string; leaving: boolean } | null>(null);
  const toastTimers = useRef<number[]>([]);

  // Two stages: the toast is marked leaving so it can play its exit, then it
  // unmounts once that has finished. Timers from an earlier toast are dropped
  // so a quick second action does not cut its own toast short.
  const notify = (message: string) => {
    for (const timer of toastTimers.current) window.clearTimeout(timer);
    setToast({ message, leaving: false });
    toastTimers.current = [
      window.setTimeout(
        () => setToast((current) => (current ? { ...current, leaving: true } : null)),
        2600
      ),
      window.setTimeout(() => setToast(null), 2800)
    ];
  };
  useEffect(
    () => () => {
      for (const timer of toastTimers.current) window.clearTimeout(timer);
    },
    []
  );
  const loadClients = useCallback(async (search: string, requestedPage: number) => {
    const params = new URLSearchParams({
      page: String(requestedPage),
      page_size: String(defaultPagination.page_size)
    });
    if (search) params.set("query", search);
    const result = await api<{
      items: StaffClientSummary[];
      summary: StaffSummary;
      pagination: StaffPagination;
    }>(`/staff/clients?${params.toString()}`);
    setClients(result.items);
    setSummary(result.summary);
    setPagination(result.pagination);
    setPage(result.pagination.page);
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
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        loadClients(query, page)
          .then(() => setError(""))
          .catch((err) => setError((err as Error).message))
          .finally(() => setLoading(false));
      },
      query ? 240 : 0
    );
    return () => window.clearTimeout(timer);
  }, [query, page, loadClients]);
  useEffect(() => {
    loadClient().catch((err) => setError((err as Error).message));
  }, [loadClient]);
  const refreshAll = useCallback(async () => {
    await Promise.all([loadClient(), loadClients(query, page)]);
  }, [loadClient, loadClients, query, page]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshAll().catch((err) => setError((err as Error).message));
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  const enterClientProfile = async () => {
    if (!client || openingClient) return;
    setOpeningClient(true);
    try {
      await openClientProfile(client.id);
      navigate("/app/overview");
    } catch (err) {
      setError((err as Error).message);
      setOpeningClient(false);
    }
  };

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
            </article>
            <article>
              <span className="kpi-icon">
                <CircleDollarSign />
              </span>
              <div>
                <small>Managed portfolio</small>
                <strong>{money(summary.portfolio, 0)}</strong>
              </div>
            </article>
            <article>
              <span className="kpi-icon">
                <MessageCircle />
              </span>
              <div>
                <small>Needs reply</small>
                <strong>{summary.needs_reply}</strong>
              </div>
            </article>
            <article>
              <span className="kpi-icon">
                <Activity />
              </span>
              <div>
                <small>Transactions</small>
                <strong>{summary.transactions}</strong>
              </div>
            </article>
          </section>
          {error && (
            <Notice variant="danger" className="staff-error">
              {error}
            </Notice>
          )}
          <section className="staff-workspace">
            <aside className="client-list-panel">
              <div className="client-list-heading">
                <div>
                  <h2>Clients</h2>
                  <Button variant="primary" size="small" onClick={() => setCreateOpen(true)}>
                    <Plus size={16} /> New
                  </Button>
                </div>
                <div className="staff-search">
                  <Search size={16} />
                  <Input
                    controlSize="small"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Search clients"
                  />
                </div>
              </div>
              <div className="client-list">
                {loading ? (
                  <EmptyState compact className="client-list-empty" title="Loading clients…" />
                ) : clients.length === 0 ? (
                  <EmptyState
                    compact
                    className="client-list-empty"
                    title="No matching clients"
                    description="Try another name, username, email, or ID."
                  />
                ) : (
                  clients.map((item) => (
                    <button
                      className={item.id === selectedId ? "active" : ""}
                      key={item.id}
                      onClick={() => {
                        setSelectedId(item.id);
                        setTab("overview");
                      }}>
                      <span className="staff-avatar">{initials(item.name)}</span>
                      <span className="client-card-copy">
                        <strong>{item.name}</strong>
                        <small>
                          @{item.username} · {relativeTime(item.last_message_at)}
                        </small>
                      </span>
                      <span className="client-card-value">
                        <strong>{money(item.total_balance, 0)}</strong>
                        {item.needs_reply ? (
                          <Badge variant="danger" className="reply-dot">
                            Reply
                          </Badge>
                        ) : null}
                      </span>
                    </button>
                  ))
                )}
              </div>
              {pagination.total > 0 && (
                <div className="client-list-pagination">
                  <span>
                    {(pagination.page - 1) * pagination.page_size + 1}–
                    {Math.min(pagination.page * pagination.page_size, pagination.total)} of{" "}
                    {pagination.total}
                  </span>
                  <div>
                    <button
                      type="button"
                      disabled={pagination.page <= 1 || loading}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      aria-label="Previous client page">
                      <CaretLeft size={16} />
                    </button>
                    <small>
                      {pagination.page} / {pagination.pages}
                    </small>
                    <button
                      type="button"
                      disabled={pagination.page >= pagination.pages || loading}
                      onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}
                      aria-label="Next client page">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </aside>
            <div className="client-detail-panel">
              {!client ? (
                <EmptyState
                  className="client-detail-empty"
                  icon={<Users size={24} />}
                  title="Select a client"
                  description="Choose an account from the list to open its workspace."
                />
              ) : (
                <>
                  <header className="client-detail-header">
                    <div className="client-title">
                      <span className="staff-avatar large">{initials(client.name)}</span>
                      <div>
                        <div>
                          <h2>{client.name}</h2>
                        </div>
                        <p>
                          @{client.username} · {client.email}
                        </p>
                      </div>
                    </div>
                    <div className="client-header-actions">
                      <div className="client-position">
                        <strong>{money(client.total_balance)}</strong>
                      </div>
                      <Button
                        variant="primary"
                        size="small"
                        disabled={client.account_status !== "active" || openingClient}
                        onClick={enterClientProfile}
                        title={
                          client.account_status !== "active"
                            ? "Only active profiles can be opened"
                            : undefined
                        }>
                        <SignIn size={16} /> {openingClient ? "Opening…" : "Open as client"}
                      </Button>
                    </div>
                  </header>
                  <Tabs
                    className="client-tabs"
                    ariaLabel="Client workspace"
                    value={tab}
                    onChange={setTab}
                    items={[
                      { value: "overview", label: "Overview", icon: <WalletCards size={16} /> },
                      { value: "chat", label: "Conversation", icon: <MessageCircle size={16} /> },
                      { value: "activity", label: "Activity", icon: <Clock3 size={16} /> }
                    ]}
                  />
                  <div className="client-detail-body">
                    {tab === "overview" && (
                      <ClientOverview
                        client={client}
                        onAdjust={setAdjustWallet}
                        onRefresh={refreshAll}
                        notify={notify}
                        onTemporaryPassword={(password) =>
                          setCredentials({ username: client.username, password })
                        }
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
            loadClients(query, page);
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
            setPage(1);
            loadClients(query, 1);
          }}
        />
      )}
      {credentials && (
        <TemporaryPasswordModal
          username={credentials.username}
          password={credentials.password}
          onClose={() => setCredentials(null)}
        />
      )}
      {toast && (
        <Notice
          variant="success"
          icon={<Check size={16} />}
          className={`staff-toast ${toast.leaving ? "is-leaving" : ""}`}>
          {toast.message}
        </Notice>
      )}
    </div>
  );
}
