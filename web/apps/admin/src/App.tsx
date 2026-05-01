import { useEffect } from "react";
import {
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuthStore } from "@music/shared";
import { LogOut } from "lucide-react";

import Sidebar from "@/components/layout/Sidebar";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import UsersPage from "@/pages/UsersPage";
import CurationPage from "@/pages/CurationPage";
import PlaylistsAdminPage from "@/pages/PlaylistsAdminPage";
import MachineLearningPage from "@/pages/MachineLearningPage";
import LibraryPage from "@/pages/LibraryPage";
import MetadataEditorPage from "@/pages/MetadataEditorPage";
import ScanPage from "@/pages/ScanPage";
import OperationsPage from "@/pages/OperationsPage";
import SecurityPage from "@/pages/SecurityPage";
import IntegrationsPage from "@/pages/IntegrationsPage";
import AuditLogsPage from "@/pages/AuditLogsPage";
import SystemConfigPage from "@/pages/SystemConfigPage";
import SettingsPage from "@/pages/SettingsPage";

function AuthenticatedLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-shell min-h-screen">
      <div className="app-layout">
        <Sidebar />

        <main className="app-main">
          <header className="app-topbar">
            <div className="app-topbar-actions">
              <button
                type="button"
                onClick={() => navigate("/system")}
                className="app-profile-button"
                title="Settings"
                aria-label="Open settings"
              >
                <span className="app-profile-avatar">
                  {user?.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user?.username ?? "Admin"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-text-secondary uppercase">
                      {user?.username?.slice(0, 1) ?? "A"}
                    </span>
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/8 text-text-secondary hover:bg-white/14 hover:text-text-primary"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="app-content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

/** Requires authenticated admin user; redirects to /login otherwise. */
function RequireAdmin() {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user?.role !== "admin") {
    return (
      <div className="app-shell min-h-screen flex items-center justify-center px-4">
        <div className="surface-panel text-center px-6 py-7 w-full max-w-md">
          <h1 className="text-xl font-semibold text-text-primary mb-2">
            Access Denied
          </h1>
          <p className="text-sm text-text-secondary">
            You need an admin account to access this dashboard.
          </p>
        </div>
      </div>
    );
  }

  return <AuthenticatedLayout />;
}

/** Redirect authenticated admins away from login. */
function PublicOnly() {
  const { isAuthenticated, user } = useAuthStore();

  if (isAuthenticated && user?.role === "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export default function App() {
  const restoreSession = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  return (
    <Routes>
      {/* Public routes */}
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* Protected admin routes */}
      <Route element={<RequireAdmin />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/curation" element={<CurationPage />} />
        <Route path="/playlists" element={<PlaylistsAdminPage />} />
        <Route path="/ml" element={<MachineLearningPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/metadata" element={<MetadataEditorPage />} />
        <Route path="/library/scan" element={<ScanPage />} />
        <Route path="/operations" element={<OperationsPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/audit" element={<AuditLogsPage />} />
        <Route path="/system" element={<SystemConfigPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
