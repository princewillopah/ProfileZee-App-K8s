// import { useEffect, useState } from "react";
// import { useParams, useNavigate, Link } from "react-router-dom";
// import { userApi, profileApi, getCurrentUser, isAdmin, isSuperAdmin } from "../services/api";
// export default function UserDetail() {
//   const { id } = useParams();
//   const navigate = useNavigate();
//   const [user, setUser] = useState(null);
//   const [profile, setProfile] = useState(null);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     loadData();
//   }, [id]);

//   async function loadData() {
//     try {
//       const [{ data: u }] = await Promise.all([userApi.get(id)]);
//       setUser(u);
//       try {
//         const { data: p } = await profileApi.get(id);
//         setProfile(p);
//       } catch (_) {}
//     } catch {
//       navigate("/");
//     } finally {
//       setLoading(false);
//     }
//   }

//   async function handleDelete() {
//     if (!window.confirm(`Delete ${user.name}?`)) return;
//     await userApi.delete(id);
//     navigate("/");
//   }

//   if (loading) return <div className="loading">Loading...</div>;
//   if (!user) return null;

//   return (
//     <div className="page">
//       <div className="page-header">
//         <button onClick={() => navigate(-1)} className="btn btn-outline">← Back</button>
//         {/* <div className="header-actions">
//           <Link to={`/users/${id}/edit`} className="btn btn-outline">Edit</Link>
//           <button onClick={handleDelete} className="btn btn-danger">Delete</button>
//         </div> */}
//         {/* {isAdmin() && (
//           <>
//             <Link to={`/users/${id}/edit`} className="btn btn-outline">Edit</Link>
//             <button onClick={handleDelete} className="btn btn-danger">Delete</button>
//           </>
//         )} */}
//           {isAdmin() && user?.role !== "superadmin" && (
//               <>
//                 <Link to={`/users/${id}/edit`} className="btn btn-outline">Edit</Link>
//                 <button onClick={handleDelete} className="btn btn-danger">Delete</button>
//               </>
//             )}
//             {user?.role === "superadmin" && (
//               <span className="badge">Protected account</span>
//             )}
//       </div>

//       <div className="detail-card">
//         <div className="detail-avatar-section">
//           {profile?.avatar_url ? (
//             <img src={profile.avatar_url} alt={user.name} className="avatar-xl" />
//           ) : (
//             <div className="avatar-placeholder-xl">{user.name.charAt(0).toUpperCase()}</div>
//           )}
//           <div>
//             <h2>{user.name}</h2>
//             <span className={`role-tag ${user.role}`}>{user.role}</span>
//           </div>
//         </div>

//         <div className="detail-grid">
//           <div className="detail-item">
//             <label>Email</label>
//             <span>{user.email}</span>
//           </div>
//           {user.phone && (
//             <div className="detail-item">
//               <label>Phone</label>
//               <span>{user.phone}</span>
//             </div>
//           )}
//           {user.department && (
//             <div className="detail-item">
//               <label>Department</label>
//               <span>{user.department}</span>
//             </div>
//           )}
//           {profile?.location && (
//             <div className="detail-item">
//               <label>Location</label>
//               <span>{profile.location}</span>
//             </div>
//           )}
//           <div className="detail-item">
//             <label>Member since</label>
//             <span>{new Date(user.created_at).toLocaleDateString()}</span>
//           </div>
//         </div>

//         {profile?.bio && (
//           <div className="detail-bio">
//             <label>Bio</label>
//             <p>{profile.bio}</p>
//           </div>
//         )}

//         <div className="service-badges">
//           <span className="svc-badge user-svc">User Service (FastAPI + PostgreSQL)</span>
//           <span className="svc-badge profile-svc">Profile Service (FastAPI + S3)</span>
//           <span className="svc-badge auth-svc">Auth Service (Java + MySQL + Redis)</span>
//           <span className="svc-badge notif-svc">Notification via Kafka</span>
//         </div>
//       </div>
//     </div>
//   );
// }









import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { userApi, profileApi, isAdmin } from "../services/api";

export default function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      const { data: u } = await userApi.get(id);
      setUser(u);
      try {
        const { data: p } = await profileApi.get(id);
        setProfile(p);
      } catch (_) {}
    } catch {
      navigate("/");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${user.name}? This cannot be undone.`)) return;
    await userApi.delete(id);
    navigate("/");
  }

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return null;

  return (
    <div className="app-layout">
      {/* SIDEBAR stub — same as UserList */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">👥</div>
          <div>
            <span>ProfileZee</span>
            <small>Admin Console</small>
          </div>
        </div>
        <nav className="sidebar-nav" style={{ padding: "0 0.75rem" }}>
          <a href="/">
            <span className="sidebar-nav-icon">🏠</span> Dashboard
          </a>
          <a href="/users/new">
            <span className="sidebar-nav-icon">➕</span> Add User
          </a>
        </nav>
      </aside>

      <div className="main-content">
        <div className="topbar">
          <div className="topbar-title">
            <h2>User Profile</h2>
            <p>Viewing details for {user.name}</p>
          </div>
          <div className="topbar-actions">
            <button onClick={() => navigate(-1)} className="btn btn-outline">← Back</button>
            {isAdmin() && user.role !== "superadmin" && (
              <>
                <Link to={`/users/${id}/edit`} className="btn btn-outline">Edit</Link>
                <button onClick={handleDelete} className="btn btn-danger">Delete</button>
              </>
            )}
            {user.role === "superadmin" && (
              <span className="role-badge superadmin">Protected account</span>
            )}
          </div>
        </div>

        <div className="page-body">
          <div className="detail-card" style={{ maxWidth: 700 }}>
            {/* HERO BANNER */}
            <div className="detail-hero">
              <div className="detail-avatar-wrap">
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt={user.name} />
                  : user.name.charAt(0).toUpperCase()}
              </div>
            </div>

            <div className="detail-body">
              <div className="detail-name-row">
                <div>
                  <h2>{user.name}</h2>
                  <span className={`role-badge ${user.role}`} style={{ marginTop: 6, display: "inline-block" }}>
                    {user.role}
                  </span>
                </div>
                {user.department && (
                  <span style={{ fontSize: 13, color: "var(--gray-500)", background: "var(--gray-100)", padding: "4px 12px", borderRadius: 100 }}>
                    🏢 {user.department}
                  </span>
                )}
              </div>

              <div className="detail-grid">
                <div className="detail-item">
                  <label>Email</label>
                  <span>{user.email}</span>
                </div>
                {user.phone && (
                  <div className="detail-item">
                    <label>Phone</label>
                    <span>{user.phone}</span>
                  </div>
                )}
                {profile?.location && (
                  <div className="detail-item">
                    <label>Location</label>
                    <span>{profile.location}</span>
                  </div>
                )}
                <div className="detail-item">
                  <label>Member since</label>
                  <span>{new Date(user.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
                </div>
              </div>

              {profile?.bio && (
                <div className="detail-bio">
                  <label>Bio</label>
                  <p>{profile.bio}</p>
                </div>
              )}

              <div className="service-badges">
                <span className="svc-badge user-svc">User Service · FastAPI + PostgreSQL</span>
                <span className="svc-badge profile-svc">Profile Service · S3</span>
                <span className="svc-badge auth-svc">Auth · Spring Boot + Redis</span>
                <span className="svc-badge notif-svc">Notifications · Kafka</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}