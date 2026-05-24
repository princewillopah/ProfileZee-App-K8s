// import { useState } from "react";
// import { useNavigate } from "react-router-dom";
// import { authApi } from "../services/api";

// export default function Login() {
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState("");
//   const navigate = useNavigate();

//   async function handleSubmit(e) {
//     e.preventDefault();
//     setLoading(true);
//     setError("");
//     try {
//       const { data } = await authApi.login(email, password);
//       // Store token and user info in localStorage
//       localStorage.setItem("token", data.token);
//       localStorage.setItem("user", JSON.stringify({
//         userId: data.userId,
//         role: data.role,
//         email,
//       }));
//       navigate("/");
//     } catch (err) {
//       setError("Invalid email or password");
//     } finally {
//       setLoading(false);
//     }
//   }

//   return (
//     <div className="login-page">
//       <div className="login-card">
//         <div className="login-header">
//           <span className="brand-icon">👥</span>
//           <h1>UserApp</h1>
//           <p>Sign in to your account</p>
//         </div>

//         {error && <div className="error-banner">{error}</div>}

//         <form onSubmit={handleSubmit} className="login-form">
//           <div className="form-row">
//             <label>Email</label>
//             <input
//               type="email"
//               value={email}
//               onChange={(e) => setEmail(e.target.value)}
//               required
//               placeholder="you@company.com"
//               autoFocus
//             />
//           </div>
//           <div className="form-row">
//             <label>Password</label>
//             <input
//               type="password"
//               value={password}
//               onChange={(e) => setPassword(e.target.value)}
//               required
//               placeholder="Your password"
//             />
//           </div>
//           <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
//             {loading ? "Signing in..." : "Sign in"}
//           </button>
//         </form>

//         <p className="login-hint">
//           Only admins can create, edit, or delete users.
//         </p>
//       </div>
//     </div>
//   );
// }





import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../services/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await authApi.login(email, password);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify({ userId: data.userId, role: data.role, email }));
      navigate("/");
    } catch {
      setError("Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      {/* LEFT HERO */}
      <div className="login-hero">
        <div className="hero-badge">
          <span></span> Platform Status: All systems operational
        </div>

        <h1>Manage your team with confidence</h1>

        <p>
          ProfileZee is a microservices-powered user management platform built
          for modern teams. Roles, profiles, notifications — all in one place.
        </p>

        <div className="hero-features">
          <div className="hero-feature">
            <div className="hero-feature-icon">👤</div>
            Role-based access control for admins and members
          </div>
          <div className="hero-feature">
            <div className="hero-feature-icon">🖼️</div>
            Profile pictures stored securely on AWS S3
          </div>
          <div className="hero-feature">
            <div className="hero-feature-icon">📧</div>
            Real-time email notifications via Kafka events
          </div>
          <div className="hero-feature">
            <div className="hero-feature-icon">🔐</div>
            JWT authentication powered by Spring Boot
          </div>
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <strong>6</strong>
            <span>Microservices</span>
          </div>
          <div className="hero-stat">
            <strong>K8s</strong>
            <span>Orchestrated</span>
          </div>
          <div className="hero-stat">
            <strong>S3</strong>
            <span>File Storage</span>
          </div>
        </div>
      </div>

      {/* RIGHT LOGIN FORM */}
      <div className="login-right">
        <div className="login-card">
          <div className="login-card-header">
            <div className="login-logo">
              <div className="login-logo-icon">👥</div>
              <span>ProfileZee</span>
            </div>
            <h2>Welcome back</h2>
            <p>Sign in to your admin account to continue</p>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-field">
              <label>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                autoFocus
              />
            </div>
            <div className="form-field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Your password"
              />
            </div>
            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? "Signing in..." : "Sign in →"}
            </button>
          </form>

          <p className="login-hint">
            Login: admin@userapp.com / Password: Admin@1234
          </p>
        </div>
      </div>
    </div>
  );
}




