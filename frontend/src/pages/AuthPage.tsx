import { Pulse as Activity, Clock as Clock3, Eye, EyeSlash, ShieldCheck } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { localizeClientError, useClientI18n } from "../clientI18n";
import { Brand } from "../components/Brand";
import { HalftoneReveal } from "../components/HalftoneReveal";
import { Button, Field, Input, Notice, Tabs } from "../components/UI";
import { navigate } from "../router";

export function AuthPage() {
  const { user, login, register } = useAuth();
  const { locale, t } = useClientI18n();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user) navigate(user.is_staff ? "/staff" : "/app/overview", true);
  }, [user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "login") await login(username, password);
      else await register({ name, username, email, password });
      // The auth state effect sends staff and clients to their respective workspace.
    } catch (err) {
      setError(localizeClientError((err as Error).message, locale));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <HalftoneReveal
          className="auth-halftone"
          src="/auth-halftone-red.webp"
          inkColor="#110103"
          paperColor="#57060e"
          shape="circle"
          dotDensity={78}
          dotSize={0.82}
          angle={-8}
          contrast={1.3}
          revealRadius={0.25}
          edge={0.56}
          follow={0.2}
          idleReveal={0.05}
        />
        <div className="auth-brand">
          <Brand />
        </div>
        <div className="auth-copy">
          <h1>{t("authHeroTitle")}</h1>
          <p>{t("authHeroDescription")}</p>
          <div className="hero-features">
            <span>
              <ShieldCheck /> {t("securityFeature")}
            </span>
            <span>
              <Activity /> {t("chainsFeature")}
            </span>
            <span>
              <Clock3 /> {t("supportFeature")}
            </span>
          </div>
        </div>
        <p className="auth-footer">© 2026 Momentum Labs · v1.0.0</p>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <Tabs
            className="auth-tabs"
            variant="segmented"
            ariaLabel={t("authMode")}
            value={mode}
            onChange={(nextMode) => {
              setMode(nextMode);
              setError("");
            }}
            items={[
              { value: "login", label: t("signIn") },
              { value: "register", label: t("createAccount") },
            ]}
          />
          <div className="auth-form-content">
            <div className="auth-title">
              <h2>{mode === "login" ? t("welcomeBack") : t("createWallet")}</h2>
              <p>
                {mode === "login"
                  ? t("signInDescription")
                  : t("registerDescription")}
              </p>
            </div>
            <form className="auth-form" onSubmit={submit}>
            {/* Keyed so switching modes mounts the extra fields as new nodes
                instead of repurposing the ones already on screen — that is
                what lets only the new field play the entrance. */}
            {mode === "register" && (
              <div className="auth-name-row" key="identity">
                <Field label={t("name")}>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Alex Morgan"
                    autoComplete="name"
                    required
                  />
                </Field>
                <Field label={t("username")}>
                  <Input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    required
                  />
                </Field>
              </div>
            )}
            {mode === "login" && (
              <Field label={t("usernameOrEmail")} key="username">
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                />
              </Field>
            )}
            {mode === "register" && (
              <Field label={t("email")} key="email">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </Field>
            )}
            <Field label={t("password")} key="password">
              <div className="password-field">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : 1}
                required
              />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? t("hidePassword") : t("showPassword")}>{showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}</button>
              </div>
              {mode === "register" && <small className="auth-password-hint">{t("passwordRule")}</small>}
            </Field>
            {error && <Notice variant="danger">{error}</Notice>}
            <Button type="submit" variant="primary" size="large" className="auth-submit" disabled={busy}>
              {busy ? t("waiting") : mode === "login" ? t("signIn") : t("createWalletButton")}
            </Button>
            </form>
            <p className="auth-help">
            {mode === "login" ? (
              <>
                {t("newToMomentum")}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError("");
                  }}>
                  {t("createAccount")}
                </button>
              </>
            ) : (
              <>
                {t("alreadyAccount")}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}>
                  {t("signIn")}
                </button>
              </>
            )}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
