import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from "react-router-dom";
import UserList from "./pages/UserList";
import UserForm from "./pages/UserForm";
import UserDetail from "./pages/UserDetail";
import Login from "./pages/Login";
import { getCurrentUser, isAdmin, isSuperAdmin, authApi } from "./services/api";
import "./App.css";

// Protects any route that requires login
function PrivateRoute({ children }) {
  const user = getCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Protects routes that require admin role
function AdminRoute({ children }) {
  const user = getCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin" && user.role !== "superadmin") return <Navigate to="/" replace />;
  return children;
}

function Navbar() {
  const navigate = useNavigate();
  const user = getCurrentUser();

  async function handleLogout() {
    if (user?.userId) {
      await authApi.logout(user.userId).catch(() => {});
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  if (!user) return null;

  return (
    <nav className="navbar">
      <Link to="/" className="nav-brand">
        <span className="brand-icon">👥</span>
        UserApp
      </Link>
      <div className="nav-links">
        <Link to="/" className="nav-link">Users</Link>
        {isAdmin() && (
          <Link to="/users/new" className="nav-link nav-cta">+ Add User</Link>
        )}
        <div className="nav-user">
          <span className={`role-tag ${user.role}`}>{user.role}</span>
          <span className="nav-email">{user.email}</span>
          <button onClick={handleLogout} className="btn btn-outline btn-sm">
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<PrivateRoute><UserList /></PrivateRoute>} />
            <Route path="/users/new" element={<AdminRoute><UserForm /></AdminRoute>} />
            <Route path="/users/:id" element={<PrivateRoute><UserDetail /></PrivateRoute>} />
            <Route path="/users/:id/edit" element={<AdminRoute><UserForm /></AdminRoute>} />
          </Routes>
        </main>

        <footer className="footer">
          <p>
            <strong>Architecture:</strong> User Service (FastAPI) · Profile Service (FastAPI) · Auth Service (Java Spring) · Notification Service (FastAPI) · Kafka · Redis · PostgreSQL · MySQL · AWS S3
          </p>
        </footer>
      </div>
    </BrowserRouter>
  );
}