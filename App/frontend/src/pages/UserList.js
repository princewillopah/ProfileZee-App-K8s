// import { useEffect, useState } from "react";
// import { Link, useNavigate } from "react-router-dom";
// import { userApi, profileApi } from "../services/api";
// // import { isAdmin } from "../services/api";
// import { isAdmin, isSuperAdmin, getCurrentUser } from "../services/api";

// export default function UserList() {
//   const [users, setUsers] = useState([]);
//   const [profiles, setProfiles] = useState({});
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState("");
//   const navigate = useNavigate();

//   useEffect(() => {
//     loadUsers();
//   }, []);

//   async function loadUsers() {
//     try {
//       setLoading(true);
//       const { data } = await userApi.list();
//       setUsers(data);

//       // Fetch profile pictures for each user
//       const profileMap = {};
//       await Promise.allSettled(
//         data.map(async (u) => {
//           try {
//             const { data: profile } = await profileApi.get(u.id);
//             profileMap[u.id] = profile;
//           } catch (_) {} // Profile may not exist yet
//         })
//       );
//       setProfiles(profileMap);
//     } catch (e) {
//       setError("Failed to load users. Is the backend running?");
//     } finally {
//       setLoading(false);
//     }
//   }

//   async function deleteUser(id, name) {
//     if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
//     try {
//       await userApi.delete(id);
//       setUsers((prev) => prev.filter((u) => u.id !== id));
//     } catch {
//       alert("Failed to delete user");
//     }
//   }

//   if (loading) return <div className="loading">Loading users...</div>;
//   if (error) return <div className="error-banner">{error}</div>;

//   return (
//     <div className="page">
//       <div className="page-header">
//         <h1>Users</h1>
//         <Link to="/users/new" className="btn btn-primary">+ Add User</Link>
//       </div>

//       {users.length === 0 ? (
//         <div className="empty-state">
//           <p>No users yet.</p>
//           <Link to="/users/new" className="btn btn-primary">Create the first user</Link>
//         </div>
//       ) : (
//         <div className="user-grid">
//           {users.map((user) => {
//             const profile = profiles[user.id];
//             return (
//               <div key={user.id} className="user-card">
//                 <div className="avatar-wrap">
//                   {profile?.avatar_url ? (
//                     <img
//                       src={profile.avatar_url}
//                       alt={user.name}
//                       className="avatar"
//                     />
//                   ) : (
//                     <div className="avatar-placeholder">
//                       {user.name.charAt(0).toUpperCase()}
//                     </div>
//                   )}
//                 </div>
//                 <div className="user-info">
//                   <h3>{user.name}</h3>
//                   <p className="email">{user.email}</p>
//                   {user.department && <p className="badge">{user.department}</p>}
//                   <span className={`role-tag ${user.role}`}>{user.role}</span>
//                 </div>
//                 <div className="user-actions">
//                     <button onClick={() => navigate(`/users/${user.id}`)} className="btn btn-sm">
//                       View
//                     </button>
//                     {isAdmin() && user.role !== "superadmin" && (
//                       <>
//                         <button onClick={() => navigate(`/users/${user.id}/edit`)} className="btn btn-sm btn-outline">
//                           Edit
//                         </button>
//                         <button onClick={() => deleteUser(user.id, user.name)} className="btn btn-sm btn-danger">
//                           Delete
//                         </button>
//                       </>
//                     )}
//                     {isSuperAdmin() && user.role === "superadmin" && (
//                       <span className="badge" style={{fontSize:"11px"}}>Protected</span>
//                     )}
//                 </div>
//               </div>
//             );
//           })}
//         </div>
//       )}
//     </div>
//   );
// }


import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { userApi, profileApi, isAdmin, isSuperAdmin, getCurrentUser } from "../services/api";

export default function UserList() {
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      const { data } = await userApi.list();
      setUsers(data);
      const profileMap = {};
      await Promise.allSettled(
        data.map(async (u) => {
          try {
            const { data: profile } = await profileApi.get(u.id);
            profileMap[u.id] = profile;
          } catch (_) {}
        })
      );
      setProfiles(profileMap);
    } catch {
      setError("Failed to load users. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  async function deleteUser(id, name) {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      await userApi.delete(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch {
      alert("Failed to delete user");
    }
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.department || "").toLowerCase().includes(q);
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === "admin" || u.role === "superadmin").length,
    members: users.filter((u) => u.role === "member").length,
    departments: [...new Set(users.map((u) => u.department).filter(Boolean))].length,
  };

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
  }

  if (loading) return <div className="loading">Loading users...</div>;
  if (error) return <div className="error-banner" style={{ margin: "2rem" }}>{error}</div>;

  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">👥</div>
          <div>
            <span>ProfileZee</span>
            <small>Admin Console</small>
          </div>
        </div>

        <div style={{ padding: "0 0 1rem" }}>
          <div className="sidebar-section-label" style={{ marginBottom: "8px" }}>Menu</div>
          <nav className="sidebar-nav">
            <a href="/" className="active">
              <span className="sidebar-nav-icon">🏠</span> Dashboard
            </a>
            <a href="/users/new">
              <span className="sidebar-nav-icon">➕</span> Add User
            </a>
          </nav>
        </div>

        <div style={{ flex: 1 }} />

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {currentUser?.email?.charAt(0).toUpperCase() || "A"}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{currentUser?.email}</div>
              <div className="sidebar-user-role">{currentUser?.role}</div>
            </div>
          </div>
          <nav className="sidebar-nav" style={{ marginTop: "4px" }}>
            <button onClick={handleLogout}>
              <span className="sidebar-nav-icon">🚪</span> Sign out
            </button>
          </nav>
        </div>
      </aside>

      {/* MAIN */}
      <div className="main-content">
        {/* TOPBAR */}
        <div className="topbar">
          <div className="topbar-title">
            <h2>User Management</h2>
            <p>{users.length} total users across your organization</p>
          </div>
          <div className="topbar-actions">
            {isAdmin() && (
              <Link to="/users/new" className="btn btn-primary">
                + Add User
              </Link>
            )}
          </div>
        </div>

        <div className="page-body">
          {/* STATS */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon purple">👥</div>
              <div className="stat-info">
                <strong>{stats.total}</strong>
                <span>Total Users</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon amber">🔑</div>
              <div className="stat-info">
                <strong>{stats.admins}</strong>
                <span>Admins</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green">✅</div>
              <div className="stat-info">
                <strong>{stats.members}</strong>
                <span>Members</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon blue">🏢</div>
              <div className="stat-info">
                <strong>{stats.departments}</strong>
                <span>Departments</span>
              </div>
            </div>
          </div>

          {/* SEARCH + FILTER TOOLBAR */}
          <div className="toolbar">
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                type="text"
                placeholder="Search by name, email or department..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="filter-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="all">All Roles</option>
              <option value="superadmin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="member">Member</option>
            </select>
            <button className="btn btn-outline" onClick={loadUsers}>
              ↺ Refresh
            </button>
          </div>

          {/* USER TABLE */}
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <h3>{search ? "No users match your search" : "No users yet"}</h3>
              <p>{search ? "Try a different name, email or department." : "Get started by adding your first team member."}</p>
              {!search && isAdmin() && (
                <Link to="/users/new" className="btn btn-primary">Create first user</Link>
              )}
            </div>
          ) : (
            <div className="user-table-wrap">
              <table className="user-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => {
                    const profile = profiles[user.id];
                    return (
                      <tr key={user.id}>
                        <td>
                          <div className="user-table-avatar">
                            <div className="avatar-circle">
                              {profile?.avatar_url
                                ? <img src={profile.avatar_url} alt={user.name} />
                                : user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="user-name">{user.name}</div>
                              <div className="user-email">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>{user.department || <span style={{ color: "var(--gray-400)" }}>—</span>}</td>
                        <td>
                          <span className={`role-badge ${user.role}`}>{user.role}</span>
                        </td>
                        <td>{new Date(user.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => navigate(`/users/${user.id}`)}
                            >
                              View
                            </button>
                            {isAdmin() && user.role !== "superadmin" && (
                              <>
                                <button
                                  className="btn btn-outline btn-sm"
                                  onClick={() => navigate(`/users/${user.id}/edit`)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => deleteUser(user.id, user.name)}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                            {user.role === "superadmin" && (
                              <span className="role-badge superadmin" style={{ fontSize: "11px" }}>Protected</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ARCH FOOTER */}
        <div className="arch-banner">
          <p>Powered by a microservices architecture on Kubernetes</p>
          <div className="arch-tags">
            <span className="arch-tag">FastAPI + PostgreSQL</span>
            <span className="arch-tag">Spring Boot + MySQL</span>
            <span className="arch-tag">Kafka Events</span>
            <span className="arch-tag">AWS S3</span>
            <span className="arch-tag">Redis Cache</span>
            <span className="arch-tag">Docker + K8s</span>
          </div>
        </div>
      </div>
    </div>
  );
}