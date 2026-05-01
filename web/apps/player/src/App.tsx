import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@music/shared";
import Sidebar from "@/components/layout/Sidebar";
import PlayerBar from "@/components/layout/PlayerBar";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import HomePage from "@/pages/HomePage";
import LibraryPage from "@/pages/LibraryPage";
import DiscoveryPage from "@/pages/DiscoveryPage";
import AlbumPage from "@/pages/AlbumPage";
import ArtistPage from "@/pages/ArtistPage";
import PlaylistsPage from "@/pages/PlaylistsPage";
import PlaylistDetailPage from "@/pages/PlaylistDetailPage";
import ProfilePage from "@/pages/ProfilePage";
import TopNotification from "@/components/common/TopNotification";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function AuthenticatedLayout() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className="app-shell min-h-screen">
      <TopNotification />

      <div className="app-layout">
        <Sidebar />

        <main className="app-main">
          <header className="app-topbar">
            <div className="app-topbar-actions">
              <button
                type="button"
                onClick={() => navigate("/profile")}
                className="app-profile-button"
                title="Profile"
                aria-label="Open profile"
              >
                <span className="app-profile-avatar">
                  {user?.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user?.username ?? "User"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-text-secondary uppercase">
                      {(user?.username?.slice(0, 1) || "U")}
                    </span>
                  )}
                </span>
              </button>
            </div>
          </header>

          <div className="app-content">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/discovery" element={<DiscoveryPage />} />
              <Route path="/playlists" element={<PlaylistsPage />} />
              <Route path="/playlists/:id" element={<PlaylistDetailPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/album/:id" element={<AlbumPage />} />
              <Route path="/artist/:id" element={<ArtistPage />} />
              <Route path="/search" element={<SearchPlaceholder />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>

      <PlayerBar />
    </div>
  );
}

function SearchPlaceholder() {
  return (
    <div className="page-header py-8 md:py-10 text-center">
      <p className="text-text-primary text-xl font-semibold">Search is in active development</p>
      <p className="text-text-secondary text-sm mt-2">
        Next pass includes quick filters, lyrics-aware search, and smart suggestions.
      </p>
    </div>
  );
}

export default function App() {
  const { restoreSession } = useAuthStore();

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
