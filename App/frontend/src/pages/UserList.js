import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { userApi, profileApi } from "../services/api";
// import { isAdmin } from "../services/api";
import { isAdmin, isSuperAdmin, getCurrentUser } from "../services/api";

export default function UserList() {
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      const { data } = await userApi.list();
      setUsers(data);

      // Fetch profile pictures for each user
      const profileMap = {};
      await Promise.allSettled(
        data.map(async (u) => {
          try {
            const { data: profile } = await profileApi.get(u.id);
            profileMap[u.id] = profile;
          } catch (_) {} // Profile may not exist yet
        })
      );
      setProfiles(profileMap);
    } catch (e) {
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

  if (loading) return <div className="loading">Loading users...</div>;
  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Users</h1>
        <Link to="/users/new" className="btn btn-primary">+ Add User</Link>
      </div>

      {users.length === 0 ? (
        <div className="empty-state">
          <p>No users yet.</p>
          <Link to="/users/new" className="btn btn-primary">Create the first user</Link>
        </div>
      ) : (
        <div className="user-grid">
          {users.map((user) => {
            const profile = profiles[user.id];
            return (
              <div key={user.id} className="user-card">
                <div className="avatar-wrap">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={user.name}
                      className="avatar"
                    />
                  ) : (
                    <div className="avatar-placeholder">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="user-info">
                  <h3>{user.name}</h3>
                  <p className="email">{user.email}</p>
                  {user.department && <p className="badge">{user.department}</p>}
                  <span className={`role-tag ${user.role}`}>{user.role}</span>
                </div>
                <div className="user-actions">
                    <button onClick={() => navigate(`/users/${user.id}`)} className="btn btn-sm">
                      View
                    </button>
                    {isAdmin() && user.role !== "superadmin" && (
                      <>
                        <button onClick={() => navigate(`/users/${user.id}/edit`)} className="btn btn-sm btn-outline">
                          Edit
                        </button>
                        <button onClick={() => deleteUser(user.id, user.name)} className="btn btn-sm btn-danger">
                          Delete
                        </button>
                      </>
                    )}
                    {isSuperAdmin() && user.role === "superadmin" && (
                      <span className="badge" style={{fontSize:"11px"}}>Protected</span>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
