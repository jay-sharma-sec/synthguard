
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, LockKeyhole, UserRound, ArrowRight } from "lucide-react";
import NeonButton from "../components/ui/NeonButton";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("analyst");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (username.trim() === "analyst" && password === "synthguard") {
      sessionStorage.setItem("synthguard-demo-session", "active");
      navigate("/app/dashboard");
      return;
    }

    setError("Invalid demo credentials. Check your analyst ID and access key.");
  }

  return (
    <main className="login-screen app-background">
      <section className="login-card panel animate-in">
        <div className="login-brand">
          <div className="splash-logo login-logo">
            <ShieldCheck size={32} />
          </div>
          <div className="eyebrow">Secure analyst access</div>
          <h1>Welcome back.</h1>
          <p className="muted">Authenticate to access the command center.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="analyst-id">Analyst ID</label>
          <div className="login-input-wrap">
            <UserRound size={17} />
            <input
              id="analyst-id"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>

          <label htmlFor="access-key">Access key</label>
          <div className="login-input-wrap">
            <LockKeyhole size={17} />
            <input
              id="access-key"
              type="password"
              autoComplete="current-password"
              placeholder="Enter access key"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && <div className="login-error" role="alert">{error}</div>}

          <NeonButton type="submit" className="login-submit">
            Authenticate <ArrowRight size={17} />
          </NeonButton>
        </form>

        <div className="login-notice">
          <span className="pulse-dot" />
          Temporary local demo authentication
        </div>
      </section>
    </main>
  );
}
