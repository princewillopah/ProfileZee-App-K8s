import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import UserList from "./pages/UserList";
import UserForm from "./pages/UserForm";
import UserDetail from "./pages/UserDetail";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="navbar">
          <Link to="/" className="nav-brand">
            <span className="brand-icon">👥</span>
            UserApp
          </Link>
          <div className="nav-links">
            <Link to="/" className="nav-link">Users</Link>
            <Link to="/users/new" className="nav-link nav-cta">+ Add User</Link>
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<UserList />} />
            <Route path="/users/new" element={<UserForm />} />
            <Route path="/users/:id" element={<UserDetail />} />
            <Route path="/users/:id/edit" element={<UserForm />} />
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
