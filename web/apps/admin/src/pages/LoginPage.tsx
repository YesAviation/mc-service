import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuthStore } from "@music/shared";
import { Loader2, Music2 } from "lucide-react";

export default function LoginPage() {
  const { login, isLoading, isAuthenticated, user } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  if (isAuthenticated && user?.role === "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await login({ username, password });
      const user = useAuthStore.getState().user;
      if (user?.role !== "admin") {
        useAuthStore.getState().logout();
        setError("Access denied. Admin role required.");
        return;
      }
      navigate("/dashboard");
    } catch {
      setError("Invalid username or password");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-11 h-11 rounded-2xl bg-accent flex items-center justify-center shadow-[0_16px_34px_-18px_var(--color-accent)]">
            <Music2 size={22} className="text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-text-primary">
            Music Admin
          </span>
        </div>

        <div className="surface-panel p-7">
          <h1 className="text-xl font-semibold text-text-primary mb-1">
            Admin sign in
          </h1>
          <p className="text-sm text-text-secondary mb-6">
            Sign in to manage your music server
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-lg bg-bg-primary border border-border-default text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 rounded-lg bg-bg-primary border border-border-default text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
                placeholder="Enter your password"
              />
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              Sign in
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-text-secondary mt-6">
          Admin accounts are managed by your server owner.
        </p>
      </div>
    </div>
  );
}
