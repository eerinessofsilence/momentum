import { Pulse as Activity, Clock as Clock3, ShieldCheck } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { Brand } from "../components/Brand";
import { Button, Field, Input, Notice, Tabs } from "../components/UI";
import { navigate } from "../router";

export function AuthPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <div className="auth-orb orb-one" />
        <div className="auth-orb orb-two" />
        <div className="auth-brand">
          <Brand />
        </div>
        <div className="auth-copy">
          <h1>The wallet that keeps your future in motion.</h1>
          <p>Move, swap, and manage your portfolio through a secure multi-chain experience.</p>
          <div className="hero-features">
            <span>
              <ShieldCheck /> Advanced security at every step.
            </span>
            <span>
              <Activity /> Four chains supported — BTC, ETH, USDT, TON.
            </span>
            <span>
              <Clock3 /> Momentum Support — replies in seconds.
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
            ariaLabel="Authentication mode"
            value={mode}
            onChange={(nextMode) => {
              setMode(nextMode);
              setError("");
            }}
            items={[
              { value: "login", label: "Sign in" },
              { value: "register", label: "Create account" },
            ]}
          />
          <div className="auth-title">
            <h2>{mode === "login" ? "Welcome back" : "Create your wallet"}</h2>
            <p>
              {mode === "login"
                ? "Sign in to access your Momentum workspace."
                : "Create your account and set up your wallet profile."}
            </p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            {/* Keyed so switching modes mounts the extra fields as new nodes
                instead of repurposing the ones already on screen — that is
                what lets only the new field play the entrance. */}
            {mode === "register" && (
              <Field label="Name" key="name">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Alex Morgan"
                  autoComplete="name"
                  required
                />
              </Field>
            )}
            <Field label={`Username${mode === "login" ? " or email" : ""}`} key="username">
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Your username..."
                autoComplete="username"
                required
              />
            </Field>
            {mode === "register" && (
              <Field label="Email" key="email">
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
            <Field label="Password" key="password">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password..."
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : 1}
                required
              />
            </Field>
            {error && <Notice variant="danger">{error}</Notice>}
            <Button type="submit" variant="primary" size="large" className="auth-submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create wallet"}
            </Button>
          </form>
          <p className="auth-help">
            New to Momentum? <button onClick={() => setMode("register")}>Create an account</button>
          </p>
        </div>
      </section>
    </div>
  );
}
