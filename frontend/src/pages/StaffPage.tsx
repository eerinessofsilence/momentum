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
  SignOut as LogOut,
  List as Menu,
  ChatCircle as MessageCircle,
  MagnifyingGlass as Search,
  PaperPlaneTilt as Send,
  PencilSimple as Edit,
  Key,
  Plus,
  Gear as Settings,
  ShieldCheck,
  SignIn,
  Trash,
  Users,
  Wallet as WalletCards,
  X
} from "@phosphor-icons/react";
import { type ChangeEvent, type FormEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { copyToClipboard } from "../clipboard";
import { Brand } from "../components/Brand";
import { CoinIcon } from "../components/CoinIcon";
import { Modal } from "../components/Modal";
import { CustomSelect } from "../components/CustomSelect";
import { useNavigationDrawer } from "../components/useNavigationDrawer";
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
import {
  StaffI18nProvider,
  buildStaffEmail,
  translateStaff,
  useStaffI18n,
  type StaffLocale,
  type StaffTranslator
} from "../staffI18n";
import type {
  ConfirmationCode,
  ProfileStatus,
  StaffClient,
  StaffClientSummary,
  Transaction,
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

const profileStatusVariant: Record<ProfileStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  suspended: "warning",
  archived: "neutral"
};

function ProfileStatusBadge({ status }: { status: ProfileStatus }) {
  const { t } = useStaffI18n();
  const label = status === "active" ? t("active") : status === "suspended" ? t("frozen") : t("deleted");
  return (
    <Badge variant={profileStatusVariant[status]} dot>
      {label}
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

function transactionTitle(item: Transaction, t: StaffTranslator) {
  if (item.kind === "adjustment") return t("adjustedAsset", { asset: item.asset });
  if (item.kind === "receive") return t("receivedAsset", { asset: item.asset });
  if (item.kind === "send") return t("sentAsset", { asset: item.asset });
  if (item.kind === "buy") return t("boughtAsset", { asset: item.asset });
  if (item.kind === "swap") {
    const target = typeof item.details.target_asset === "string" ? item.details.target_asset : "";
    return t("swappedAssets", { asset: item.asset, target });
  }
  if (item.kind === "withdrawal") return t("withdrawalAsset", { asset: item.asset });
  return item.title;
}

function relativeTime(value: string | null, locale: StaffLocale) {
  if (!value) return translateStaff(locale, "noConversation");
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(delta / 60_000));
  const formatter = new Intl.RelativeTimeFormat(locale === "uk" ? "uk-UA" : locale === "ru" ? "ru-RU" : "en-US", { numeric: "always", style: "short" });
  if (minutes < 60) return formatter.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  return new Date(value).toLocaleDateString(translateStaff(locale, "monthsLocale"), { month: "short", day: "numeric" });
}

function localizeStaffError(message: string, t: StaffTranslator) {
  if (message.startsWith("No unused confirmation codes are available")) {
    return t("noAvailableCodes");
  }
  const knownErrors: Record<string, Parameters<StaffTranslator>[0]> = {
    "Username or email is already registered": "errorRegistered",
    "Required codes cannot be lower than the number already used": "errorLowerUsed",
    "Codes cannot be cleared during an active transfer": "errorClearActive",
    "A profile can have at most 1000 ready codes": "errorCodeLimit",
    "Client not found": "errorClientMissing",
    "Transaction not found": "errorTransactionMissing",
    "Only manual credits can be edited": "errorManualCreditOnly",
    "Credit date cannot be before account creation": "errorCreditBeforeAccount",
    "Credit date cannot be in the future": "errorCreditFuture",
    "Credit cannot be reduced below the amount still available in the wallet": "errorCreditUnavailable"
  };
  if (knownErrors[message]) return t(knownErrors[message]);
  return t("unexpectedError");
}

function localDateTimeValue(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function StaffSidebar({
  open,
  onClose,
  locale,
  onLocaleChange,
  triggerRef
}: {
  open: boolean;
  onClose: () => void;
  locale: StaffLocale;
  onLocaleChange: (locale: StaffLocale) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const { user, logout } = useAuth();
  const { t } = useStaffI18n();
  const drawerRef = useRef<HTMLElement>(null);
  useNavigationDrawer(open, onClose, drawerRef, triggerRef);
  const signOut = async () => {
    await logout();
    navigate("/auth");
  };
  return (
    <>
      {open && (
        <button className="staff-mobile-scrim" onClick={onClose} aria-label={t("closeNavigation")} />
      )}
      <aside ref={drawerRef} id="operations-navigation" className={`staff-sidebar ${open ? "open" : ""}`}>
        <div className="staff-brand">
          <Brand />
          <button className="icon-button staff-nav-close" onClick={onClose} aria-label={t("closeNavigation")}>
            <X size={20} />
          </button>
        </div>
        <nav className="staff-navigation">
          <a className="active" href="/staff" onClick={(event) => event.preventDefault()}>
            <Users size={20} />
            <span>{t("clients")}</span>
          </a>
        </nav>
        <div className="staff-language" aria-label={t("language")}>
          <span>{t("language")}</span>
          <div>
            <button className={locale === "en" ? "active" : ""} onClick={() => onLocaleChange("en")}>{t("english")}</button>
            <button className={locale === "uk" ? "active" : ""} onClick={() => onLocaleChange("uk")}>{t("ukrainian")}</button>
            <button className={locale === "ru" ? "active" : ""} onClick={() => onLocaleChange("ru")}>{t("russian")}</button>
          </div>
        </div>
        <div className="staff-account">
          <div className="staff-account-meta">
            <span className="staff-avatar small">{initials(user?.name || "MO")}</span>
            <div>
              <strong>{user?.name}</strong>
              <span>{t("moderator")}</span>
            </div>
          </div>
          <button className="icon-button" onClick={signOut} aria-label={t("signOut")}>
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
  const { t } = useStaffI18n();
  const [amount, setAmount] = useState(wallet.balance);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ client: StaffClient }>(`/staff/clients/${client.id}/balance`, {
        method: "POST",
        body: JSON.stringify({ asset: wallet.symbol, action: "set", amount })
      });
      onSaved(result.client);
    } catch (err) {
      setError(localizeStaffError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t("adjustBalance")} closeLabel={t("closeDialog")} onClose={onClose}>
      {(close) => (
        <form className="modal-body staff-adjust-form" onSubmit={submit}>
          <div className="staff-adjust-client">
            <div className="staff-adjust-party">
              <span className="staff-avatar">{initials(client.name)}</span>
              <div>
                <span>{t("client")}</span>
                <strong>{client.name}</strong>
              </div>
            </div>
            <ChevronRight size={20} />
            <div className="staff-adjust-party">
              <CoinIcon symbol={wallet.symbol} size="sm" />
              <div>
                <span>{t("asset")}</span>
                <strong>{wallet.symbol}</strong>
              </div>
            </div>
          </div>
          <Field
            label={`${t("balanceAmount")} ${wallet.symbol}`}
            hint={`${t("currentBalance")}: ${assetAmount(wallet.balance, wallet.symbol)}`}>
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
            <Button onClick={close}>{t("cancel")}</Button>
            <Button type="submit" variant="primary" disabled={busy || amount === "" || Number(amount) < 0}>
              {busy ? t("applying") : t("setBalance")}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function EditCreditModal({
  client,
  transaction,
  onClose,
  onSaved
}: {
  client: StaffClient;
  transaction: Transaction;
  onClose: () => void;
  onSaved: (client: StaffClient) => void;
}) {
  const { t } = useStaffI18n();
  const [amount, setAmount] = useState(transaction.amount);
  const [effectiveAt, setEffectiveAt] = useState(localDateTimeValue(transaction.effective_at));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ client: StaffClient }>(
        `/staff/clients/${client.id}/transactions/${transaction.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            amount,
            effective_at: new Date(effectiveAt).toISOString()
          })
        }
      );
      onSaved(result.client);
    } catch (err) {
      setError(localizeStaffError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t("editCredit")} closeLabel={t("closeDialog")} onClose={onClose}>
      {(close) => (
        <form className="modal-body staff-adjust-form" onSubmit={submit}>
          <div className="staff-adjust-client">
            <div className="staff-adjust-party">
              <span className="staff-avatar">{initials(client.name)}</span>
              <div>
                <span>{t("client")}</span>
                <strong>{client.name}</strong>
              </div>
            </div>
            <ChevronRight size={20} />
            <div className="staff-adjust-party">
              <CoinIcon symbol={transaction.asset} size="sm" />
              <div>
                <span>{t("asset")}</span>
                <strong>{transaction.asset}</strong>
              </div>
            </div>
          </div>
          <Field label={`${t("amountIn")} ${transaction.asset}`} hint={t("creditEditHint")}>
            <div className="amount-field">
              <Input
                type="number"
                step="0.00000001"
                min="0.00000001"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                autoFocus
                required
              />
              <span>{transaction.asset}</span>
            </div>
          </Field>
          <Field label={t("creditDate")}>
            <Input
              type="datetime-local"
              min={localDateTimeValue(client.created_at)}
              max={localDateTimeValue(new Date())}
              value={effectiveAt}
              onChange={(event) => setEffectiveAt(event.target.value)}
              required
            />
          </Field>
          {error && <Notice variant="danger">{error}</Notice>}
          <div className="modal-actions">
            <Button onClick={close}>{t("cancel")}</Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !Number(amount) || !effectiveAt}>
              {busy ? t("saving") : t("saveCredit")}
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
  const { t } = useStaffI18n();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [emailEdited, setEmailEdited] = useState(false);
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
      setError(localizeStaffError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t("createClient")} closeLabel={t("closeDialog")} onClose={onClose}>
      {(close) => (
        <form className="modal-body space-y-4" onSubmit={submit}>
          <Field label={t("clientName")}>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("namePlaceholder")}
              autoFocus
              required
            />
          </Field>
          <Field label={t("username")} hint={t("shownUsername")}>
            <Input
              value={username}
              onChange={(event) => {
                const nextUsername = event.target.value.replace(/[^A-Za-z0-9_]/g, "");
                setUsername(nextUsername);
                if (!emailEdited) setEmail(buildStaffEmail(nextUsername));
              }}
              placeholder="e.g. mia_warren"
              required
            />
          </Field>
          <Field label={t("email")} hint={t("contactEmail")}>
            <Input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailEdited(true);
              }}
              placeholder="mia_warren@momentum-wallet.com"
              required
            />
          </Field>
          <Field label={t("requiredCodes")}>
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
            {t("createHint")}
          </p>
          {error && <Notice variant="danger">{error}</Notice>}
          <div className="modal-actions">
            <Button onClick={close}>{t("cancel")}</Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? t("creating") : t("createProfile")}
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
  const { t } = useStaffI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyToClipboard(`Login: ${username}\nPassword: ${password}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };
  return (
    <Modal title={t("temporaryCredentials")} closeLabel={t("closeDialog")} onClose={onClose}>
      <div className="modal-body space-y-4">
        <Notice variant="warning" icon={<ShieldCheck size={20} />} className="adjust-warning">
          <p>{t("passwordOnce")}</p>
        </Notice>
        <dl className="credential-card">
          <div>
            <dt>{t("login")}</dt>
            <dd>{username}</dd>
          </div>
          <div>
            <dt>{t("temporaryPassword")}</dt>
            <dd>{password}</dd>
          </div>
        </dl>
        <Button variant="primary" className="w-full" onClick={copy}>
          {copied ? (
            <>
              <Check size={16} /> {t("copied")}
            </>
          ) : (
            <>
              <Copy size={16} /> {t("copyCredentials")}
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
}

function ClientSettingsModal({
  client,
  onClose,
  onSaved,
  onDelete
}: {
  client: StaffClient;
  onClose: () => void;
  onSaved: (client: StaffClient) => void;
  onDelete: () => Promise<void>;
}) {
  const { t } = useStaffI18n();
  const [name, setName] = useState(client.name);
  const [username, setUsername] = useState(client.username);
  const [email, setEmail] = useState(client.email);
  const [dailyLimit, setDailyLimit] = useState(client.daily_send_limit);
  const [monthlyLimit, setMonthlyLimit] = useState(client.monthly_send_limit);
  const [reviewThreshold, setReviewThreshold] = useState(client.manual_review_threshold);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ client: StaffClient }>(
        `/staff/clients/${client.id}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name,
            username,
            email,
            daily_send_limit: dailyLimit,
            monthly_send_limit: monthlyLimit,
            manual_review_threshold: reviewThreshold
          })
        }
      );
      onSaved(result.client);
    } catch (err) {
      setError(localizeStaffError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  };
  const deleteClient = async () => {
    if (!window.confirm(t("deleteAccountConfirm"))) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };
  return (
    <Modal title={t("editSettings")} closeLabel={t("closeDialog")} onClose={onClose} wide>
      {(close) => (
        <form className="modal-body staff-settings-form" onSubmit={submit}>
          <div className="staff-settings-grid">
            <Field label={t("clientName")}>
              <Input value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label={t("username")}>
              <div className="username-input">
                <span>@</span>
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
                  required
                />
              </div>
            </Field>
          </div>
          <Field label={t("emailAddress")}>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <div className="staff-settings-grid">
            <Field label={t("dailyLimit")}>
              <CurrencyInput
                value={dailyLimit}
                onChange={(event) => setDailyLimit(event.target.value)}
              />
            </Field>
            <Field label={t("monthlyLimit")}>
              <CurrencyInput
                value={monthlyLimit}
                onChange={(event) => setMonthlyLimit(event.target.value)}
              />
            </Field>
          </div>
          <Field label={t("reviewThreshold")}>
            <CurrencyInput
              value={reviewThreshold}
              onChange={(event) => setReviewThreshold(event.target.value)}
            />
          </Field>
          {error && <Notice variant="danger">{error}</Notice>}
          <div className="staff-settings-actions">
            <button type="button" className="staff-settings-delete" onClick={deleteClient} disabled={busy || deleting}>
              {deleting ? t("deletingAccount") : t("deleteAccount")}
            </button>
            <div className="modal-actions">
              <Button onClick={close} disabled={deleting}>{t("cancel")}</Button>
              <Button type="submit" variant="primary" disabled={busy || deleting}>
                {busy ? t("saving") : t("saveSettings")}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

function CurrencyInput({
  value,
  onChange
}: {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="currency-input">
      <Input type="number" min="0" step="0.01" value={value} onChange={onChange} required />
      <span>USD</span>
    </div>
  );
}

function ClientOverview({
  client,
  onAdjust,
  onEditSettings,
  onRefresh,
  notify,
  onTemporaryPassword
}: {
  client: StaffClient;
  onAdjust: (wallet: Wallet) => void;
  onEditSettings: () => void;
  onRefresh: () => void;
  notify: (message: string) => void;
  onTemporaryPassword: (password: string) => void;
}) {
  const { t } = useStaffI18n();
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
      notify(t("copiedError"));
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
      notify(`${codeCount} ${codeCount === 1 ? t("code") : t("codes")} ${t("generated")}`);
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    if (
      !window.confirm(t("clearConfirm"))
    ) {
      return;
    }
    setBusy(true);
    try {
      await api(`/staff/clients/${client.id}/codes`, { method: "DELETE" });
      await onRefresh();
      notify(t("cleared"));
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
          ? t("confirmationDisabled")
          : t("requiredNow", { count: requiredCodes, noun: requiredCodes === 1 ? t("code") : t("codes") })
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
        `${nextStatus === "suspended" ? t("freezeAction") : t("deleteAction")} ${t("statusConfirm")}`
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
      const label = nextStatus === "active" ? t("active") : nextStatus === "suspended" ? t("frozen") : t("deleted");
      notify(`${t("statusChanged")} ${label}`);
    } finally {
      setBusy(false);
    }
  };
  const decideDeposit = async (requestId: number, decision: "approve" | "reject") => {
    setBusy(true);
    try {
      await api(`/staff/clients/${client.id}/deposit-requests/${requestId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision })
      });
      await onRefresh();
      notify(decision === "approve" ? t("depositApproved") : t("depositRejected"));
    } finally {
      setBusy(false);
    }
  };
  const readyCodes = client.codes.filter((item) => item.status === "ready").length;
  const missingReadyCodes = Math.max(0, client.verification_required - client.verification_used - readyCodes);
  const verificationConfigured = client.verification_required > 0;
  const verificationComplete =
    verificationConfigured && client.verification_used >= client.verification_required;
  const requirementDirty = requiredCodes !== client.verification_required;
  // One sentence for the state instead of the three the card used to carry
  // (a status line, a hint under the field, and the number in the field).
  const verificationHeadline = !verificationConfigured
    ? t("confirmationOff")
    : verificationComplete
      ? t("verificationComplete")
      : t("progress", { used: client.verification_used, required: client.verification_required });
  const verificationHint = !verificationConfigured
    ? t("confirmationOffHint")
    : verificationComplete
      ? t("verificationCompleteHint")
      : t("remaining", { count: client.verification_required - client.verification_used });
  // The first unused code is the one the moderator reads out; everything after
  // it is a queue, and used codes are history.
  const nextCode = client.codes.find((item) => item.status === "ready");
  const queuedCodes = client.codes.filter((item) => item.id !== nextCode?.id);
  const collapsedCodes = queuedCodes.slice(0, 6);
  const visibleQueue = showAllCodes ? queuedCodes : collapsedCodes;
  return (
    <div className="staff-overview-grid">
      <div className="staff-overview-main">
        <Card variant="nested" className="staff-section-card wallet-manager">
          <CardHeader
            level={3}
            className="staff-section-title"
            title={t("depositRequests")}
            trailing={<Badge variant={client.deposit_requests.some((item) => item.status === "pending") ? "warning" : "neutral"}>{client.deposit_requests.filter((item) => item.status === "pending").length} {t("pendingReview")}</Badge>}
          />
          {client.deposit_requests.length === 0 ? (
            <EmptyState compact title={t("noDepositRequests")} />
          ) : (
            <div className="staff-wallet-list">
              {client.deposit_requests.map((item) => (
                <article key={item.id}>
                  <CoinIcon symbol={item.asset} size="sm" />
                  <div className="staff-wallet-name">
                    <strong>{money(item.amount_usd)}</strong>
                    <span>{item.asset} · {new Date(item.created_at).toLocaleDateString(t("monthsLocale"))}</span>
                  </div>
                  <Badge variant={item.status === "approved" ? "success" : item.status === "rejected" ? "neutral" : "warning"}>
                    {item.status === "approved" ? t("approvedDeposit") : item.status === "rejected" ? t("rejectedDeposit") : t("pendingDeposit")}
                  </Badge>
                  {item.status === "pending" && (
                    <div className="modal-actions">
                      <Button size="small" onClick={() => decideDeposit(item.id, "reject")} disabled={busy}>{t("rejectDeposit")}</Button>
                      <Button size="small" variant="primary" onClick={() => decideDeposit(item.id, "approve")} disabled={busy}>{t("approveDeposit")}</Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </Card>
        <Card variant="nested" className="staff-section-card code-manager">
          <CardHeader
            level={3}
            className="staff-section-title"
            title={t("confirmationCodes")}
            trailing={
              <>
                <Badge>{readyCodes} {t("unused")}</Badge>
                {client.codes.length > 0 && (
                  <Button
                    variant="ghost"
                    size="small"
                    className="icon-button code-clear"
                    onClick={clear}
                    disabled={busy}
                    aria-label={t("clearAllCodes")}
                    title={t("clearAllCodes")}>
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
              <span>{t("codesRequired")}</span>
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
                aria-label={t("codesEntered")}
              />
            )}
            {requirementDirty && (
              <span className="code-requirement__hint" id="code-requirement-hint" role="status">
                {t("notSaved")}
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
                    <Check size={16} /> {t("copied")}
                  </>
                ) : (
                  <>
                    <Copy size={16} /> {t("copy")}
                  </>
                )}
              </Button>
            </div>
          ) : (
            <EmptyState
              compact
              className="codes-empty"
              icon={<Key size={28} />}
              title={client.codes.length ? t("everyCodeUsed") : t("noCodes")}
            />
          )}
          {queuedCodes.length > 0 && (
            <div className={`code-queue ${showAllCodes ? "is-expanded" : ""}`}>
              {visibleQueue.map((item) =>
                item.status === "used" ? (
                  <span className="code-chip is-used" key={item.id}>
                    <strong>{groupDigits(item.code)}</strong>
                    <small>{t("used")}</small>
                  </span>
                ) : (
                  <button
                    className="code-chip"
                    key={item.id}
                    type="button"
                    aria-label={`Copy code ${item.code}`}
                    title={t("copyCode")}
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
                {showAllCodes ? t("showFewer") : `${t("showAll")} ${queuedCodes.length}`}
              </Button>
            ) : (
              <span />
            )}
            <div className="code-generate">
              <label className="code-generate__amount">
                <span>{t("amount")}</span>
                <Input
                  controlSize="small"
                  type="number"
                  min="1"
                  max="1000"
                  value={codeCount}
                  disabled={busy}
                  aria-label={t("amount")}
                  onChange={(event) =>
                    setCodeCount(Math.min(1000, Math.max(1, Number(event.target.value))))
                  }
                />
              </label>
              <Button variant="primary" size="small" onClick={generate} disabled={busy}>
                <Plus size={16} /> {t("generate")}
              </Button>
            </div>
          </div>
          {missingReadyCodes > 0 && (
            <Notice variant="warning" className="code-shortage">
              {t("needMoreCodes", { count: missingReadyCodes, noun: missingReadyCodes === 1 ? t("code") : t("codes") })}
            </Notice>
          )}
        </Card>
        <Card variant="nested" className="staff-section-card profile-summary">
          <CardHeader
            level={3}
            className="staff-section-title"
            title={t("clientProfile")}
            trailing={
              <Button size="small" onClick={onEditSettings} disabled={busy}>
                <Settings size={16} /> {t("editSettings")}
              </Button>
            }
          />
          <dl>
            <div>
              <dt>{t("clientName")}</dt>
              <dd>{client.name}</dd>
            </div>
            <div>
              <dt>{t("username")}</dt>
              <dd>@{client.username}</dd>
            </div>
            <div>
              <dt>{t("emailAddress")}</dt>
              <dd>{client.email}</dd>
            </div>
            <div>
              <dt>{t("clientSince")}</dt>
              <dd>
                {new Date(client.created_at).toLocaleDateString(t("monthsLocale"), {
                  month: "long",
                  day: "numeric",
                  year: "numeric"
                })}
              </dd>
            </div>
            <div>
              <dt>{t("clientId")}</dt>
              <dd>#{client.id.toString().padStart(5, "0")}</dd>
            </div>
          </dl>
          <div className="profile-actions">
            <label className="profile-status-control">
              <span>{t("profileStatus")}</span>
              <CustomSelect
                controlSize="small"
                value={client.account_status}
                ariaLabel={t("profileStatus")}
                disabled={busy}
                className="profile-status-select"
                options={[
                  { value: "active", label: t("active") },
                  { value: "suspended", label: t("frozen") },
                  { value: "archived", label: t("deleted") }
                ]}
                onChange={(value) => updateProfileStatus(value as ProfileStatus)}
              />
            </label>
            <Button size="small" onClick={resetPassword} disabled={busy}>
              <Key size={16} /> {t("resetPassword")}
            </Button>
          </div>
        </Card>
      </div>
      <Card variant="nested" className="staff-section-card wallet-manager">
        <CardHeader
          level={3}
          className="staff-section-title"
          title={t("walletsBalances")}
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
                {t("adjust")}
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
  const { t } = useStaffI18n();
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
          {t("conversation")}: <strong>{client.name}</strong>
        </span>
        <Badge variant="success" dot>
          {t("clientProfile")}
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
          placeholder={t("replyPlaceholder")}
          rows={1}
        />
        <Button type="submit" variant="primary" disabled={busy || !body.trim()}>
          <Send size={16} /> {t("sendReply")}
        </Button>
      </form>
    </Card>
  );
}

function ClientActivity({
  client,
  onEditCredit
}: {
  client: StaffClient;
  onEditCredit: (transaction: Transaction) => void;
}) {
  const { t } = useStaffI18n();
  return (
    <Card variant="nested" className="staff-section-card staff-activity">
      <CardHeader
        level={3}
        className="staff-section-title"
        title={t("recentActivity")}
        trailing={<Badge>{client.transaction_count} {t("total")}</Badge>}
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
                <strong>{transactionTitle(item, t)}</strong>
                <span>
                  {new Date(item.effective_at).toLocaleString(t("monthsLocale"), {
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
              {item.editable && (
                <button
                  type="button"
                  className="icon-button activity-edit"
                  onClick={() => onEditCredit(item)}
                  title={t("editCredit")}
                  aria-label={t("editCredit")}>
                  <Edit size={16} />
                </button>
              )}
            </article>
          );
        })}
      </div>
    </Card>
  );
}

export function StaffPage() {
  const { openClientProfile } = useAuth();
  const [locale, setLocale] = useState<StaffLocale>(() => {
    const stored = window.localStorage.getItem("momentum_staff_locale");
    return stored === "en" || stored === "uk" || stored === "ru" ? stored : "ru";
  });
  const t = useCallback<StaffTranslator>(
    (key, values) => translateStaff(locale, key, values),
    [locale]
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const updateLocale = (nextLocale: StaffLocale) => {
    setLocale(nextLocale);
    window.localStorage.setItem("momentum_staff_locale", nextLocale);
  };
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
  const [mobileDetail, setMobileDetail] = useState(false);
  const [openingClient, setOpeningClient] = useState(false);
  const [adjustWallet, setAdjustWallet] = useState<Wallet | null>(null);
  const [editCredit, setEditCredit] = useState<Transaction | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(
    null
  );
  const [toast, setToast] = useState<{ message: string; leaving: boolean } | null>(null);
  const toastTimers = useRef<number[]>([]);
  const mobileNavButtonRef = useRef<HTMLButtonElement>(null);
  const closeMobileNav = useCallback(() => setMobileNav(false), []);

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
          .catch((err) => setError(localizeStaffError((err as Error).message, t)))
          .finally(() => setLoading(false));
      },
      query ? 240 : 0
    );
    return () => window.clearTimeout(timer);
  }, [query, page, loadClients, t]);
  useEffect(() => {
    loadClient().catch((err) => setError(localizeStaffError((err as Error).message, t)));
  }, [loadClient, t]);
  const refreshAll = useCallback(async () => {
    await Promise.all([loadClient(), loadClients(query, page)]);
  }, [loadClient, loadClients, query, page]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshAll().catch((err) => setError(localizeStaffError((err as Error).message, t)));
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [refreshAll, t]);

  const enterClientProfile = async () => {
    if (!client || openingClient) return;
    setOpeningClient(true);
    try {
      await openClientProfile(client.id);
      navigate("/app/overview");
    } catch (err) {
      setError(localizeStaffError((err as Error).message, t));
      setOpeningClient(false);
    }
  };
  const deleteSelectedClient = async () => {
    if (!client) return;
    await api(`/staff/clients/${client.id}`, { method: "DELETE" });
    setClient(null);
    setSelectedId(null);
    setMobileDetail(false);
    setSettingsOpen(false);
    await loadClients(query, page);
    notify(t("accountDeletedPermanently"));
  };

  return (
    <StaffI18nProvider value={{ locale, t }}>
    <div className="staff-shell">
      <StaffSidebar open={mobileNav} onClose={closeMobileNav} locale={locale} onLocaleChange={updateLocale} triggerRef={mobileNavButtonRef} />
      <main className="staff-main">
        <header className="staff-mobile-header">
          <Brand compact />
          <button ref={mobileNavButtonRef} className="icon-button" onClick={() => setMobileNav(true)} aria-label={t("openNavigation")} aria-expanded={mobileNav} aria-controls="operations-navigation">
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
                <small>{t("totalClients")}</small>
                <strong>{summary.clients}</strong>
              </div>
            </article>
            <article>
              <span className="kpi-icon">
                <CircleDollarSign />
              </span>
              <div>
                <small>{t("managedPortfolio")}</small>
                <strong>{money(summary.portfolio, 0)}</strong>
              </div>
            </article>
            <article>
              <span className="kpi-icon">
                <MessageCircle />
              </span>
              <div>
                <small>{t("needsReply")}</small>
                <strong>{summary.needs_reply}</strong>
              </div>
            </article>
            <article>
              <span className="kpi-icon">
                <Activity />
              </span>
              <div>
                <small>{t("transactions")}</small>
                <strong>{summary.transactions}</strong>
              </div>
            </article>
          </section>
          {error && (
            <Notice variant="danger" className="staff-error">
              {error}
            </Notice>
          )}
          <section className={`staff-workspace ${mobileDetail ? "mobile-detail-open" : ""}`}>
            <aside className="client-list-panel">
              <div className="client-list-heading">
                <div>
                  <h2>{t("clients")}</h2>
                  <Button variant="primary" size="small" onClick={() => setCreateOpen(true)}>
                    <Plus size={16} /> {t("new")}
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
                    placeholder={t("searchClients")}
                  />
                </div>
              </div>
              <div className="client-list">
                {loading ? (
                  <EmptyState compact className="client-list-empty" title={t("loadingClients")} />
                ) : clients.length === 0 ? (
                  <EmptyState
                    compact
                    className="client-list-empty"
                    title={t("noMatchingClients")}
                    description={t("searchHint")}
                  />
                ) : (
                  clients.map((item) => (
                    <button
                      className={item.id === selectedId ? "active" : ""}
                      key={item.id}
                      onClick={() => {
                        setSelectedId(item.id);
                        setTab("overview");
                        setMobileDetail(true);
                      }}>
                      <span className="staff-avatar">{initials(item.name)}</span>
                      <span className="client-card-copy">
                        <strong>{item.name}</strong>
                        <small>
                          @{item.username} · {relativeTime(item.last_message_at, locale)}
                        </small>
                      </span>
                      <span className="client-card-value">
                        <strong>{money(item.total_balance, 0)}</strong>
                        {item.needs_reply ? (
                          <Badge variant="danger" className="reply-dot">
                            {t("reply")}
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
                      aria-label={t("previousPage")}>
                      <CaretLeft size={16} />
                    </button>
                    <small>
                      {pagination.page} / {pagination.pages}
                    </small>
                    <button
                      type="button"
                      disabled={pagination.page >= pagination.pages || loading}
                      onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}
                      aria-label={t("nextPage")}>
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
                  title={t("selectClient")}
                  description={t("selectClientHint")}
                />
              ) : (
                <>
                  <header className="client-detail-header">
                    <button type="button" className="client-back-button" onClick={() => setMobileDetail(false)}><CaretLeft size={18} /> {t("backToClients")}</button>
                    <div className="client-title">
                      <span className="staff-avatar large">{initials(client.name)}</span>
                      <div>
                        <div>
                          <h2>{client.name}</h2>
                          <ProfileStatusBadge status={client.account_status} />
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
                        disabled={openingClient}
                        onClick={enterClientProfile}
                        title={
                          undefined
                        }>
                        <SignIn size={16} /> {openingClient ? t("opening") : t("openAsClient")}
                      </Button>
                    </div>
                  </header>
                  <Tabs
                    className="client-tabs"
                    ariaLabel={t("clientWorkspace")}
                    value={tab}
                    onChange={setTab}
                    items={[
                      { value: "overview", label: t("overview"), icon: <WalletCards size={16} /> },
                      { value: "chat", label: t("conversation"), icon: <MessageCircle size={16} /> },
                      { value: "activity", label: t("activity"), icon: <Clock3 size={16} /> }
                    ]}
                  />
                  <div className="client-detail-body">
                    {tab === "overview" && (
                      <ClientOverview
                        client={client}
                        onAdjust={setAdjustWallet}
                        onEditSettings={() => setSettingsOpen(true)}
                        onRefresh={refreshAll}
                        notify={notify}
                        onTemporaryPassword={(password) =>
                          setCredentials({ username: client.username, password })
                        }
                      />
                    )}
                    {tab === "chat" && <ClientChat client={client} onRefresh={refreshAll} />}
                    {tab === "activity" && (
                      <ClientActivity client={client} onEditCredit={setEditCredit} />
                    )}
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
            notify(`${adjustWallet.symbol}: ${locale === "ru" ? "баланс обновлён" : "balance updated"}`);
          }}
        />
      )}
      {editCredit && client && (
        <EditCreditModal
          client={client}
          transaction={editCredit}
          onClose={() => setEditCredit(null)}
          onSaved={(updated) => {
            setClient(updated);
            setEditCredit(null);
            loadClients(query, page);
            notify(t("creditUpdated"));
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
            setMobileDetail(true);
            setCredentials({ username: created.username, password });
            setPage(1);
            loadClients(query, 1);
          }}
        />
      )}
      {settingsOpen && client && (
        <ClientSettingsModal
          client={client}
          onClose={() => setSettingsOpen(false)}
          onSaved={(updated) => {
            setClient(updated);
            setSettingsOpen(false);
            loadClients(query, page);
            notify(t("settingsUpdated"));
          }}
          onDelete={deleteSelectedClient}
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
    </StaffI18nProvider>
  );
}
