// import { useEffect, useState, useRef } from "react";
// import { useNavigate, useParams } from "react-router-dom";
// import { userApi, profileApi, authApi } from "../services/api";

// export default function UserForm() {
//   const { id } = useParams();
//   const isEdit = Boolean(id);
//   const navigate = useNavigate();

//   const [form, setForm] = useState({
//     name: "", email: "", phone: "", department: "", role: "member",
//   });
//   const [profile, setProfile] = useState({ bio: "", location: "" });
//   const [avatarFile, setAvatarFile] = useState(null);
//   const [avatarPreview, setAvatarPreview] = useState(null);
//   const [currentAvatar, setCurrentAvatar] = useState(null);
//   const [password, setPassword] = useState("");
//   const [loading, setLoading] = useState(false);
//   const [uploading, setUploading] = useState(false);
//   const [error, setError] = useState("");
//   const fileInputRef = useRef();

//   useEffect(() => {
//     if (isEdit) loadUser();
//   }, [id]);

//   async function loadUser() {
//     try {
//       const { data: user } = await userApi.get(id);
//       setForm({
//         name: user.name, email: user.email,
//         phone: user.phone || "", department: user.department || "",
//         role: user.role,
//       });
//       try {
//         const { data: prof } = await profileApi.get(id);
//         setProfile({ bio: prof.bio || "", location: prof.location || "" });
//         setCurrentAvatar(prof.avatar_url);
//       } catch (_) {}
//     } catch {
//       setError("Failed to load user");
//     }
//   }

//   function handleFileChange(e) {
//     const file = e.target.files[0];
//     if (!file) return;
//     if (!file.type.startsWith("image/")) {
//       setError("Please select an image file");
//       return;
//     }
//     if (file.size > 5 * 1024 * 1024) {
//       setError("Image must be under 5MB");
//       return;
//     }
//     setAvatarFile(file);
//     setAvatarPreview(URL.createObjectURL(file));
//     setError("");
//   }

// async function handleSubmit(e) {
//   e.preventDefault();
//   setLoading(true);
//   setError("");

//   try {
//     let userId = id;

//     if (isEdit) {
//       // Run user update and profile update in parallel
//       const updates = [userApi.update(id, form)];

//       if (avatarFile) {
//         setUploading(true);
//         updates.push(profileApi.uploadAvatar(userId, avatarFile, profile.bio, profile.location));
//       } else if (profile.bio || profile.location) {
//         updates.push(profileApi.update(userId, profile.bio, profile.location));
//       }

//       // Wait for ALL updates together — if one fails, we know immediately
//       await Promise.all(updates);
//       setUploading(false);

//     } else {
//       // Create user first
//       const { data: newUser } = await userApi.create(form);
//       userId = newUser.id;

//       // Register auth credentials
//       if (password) {
//         await authApi.register(userId, form.email, password, form.role);
//       }

//       // Upload avatar if provided
//       if (avatarFile) {
//         setUploading(true);
//         await profileApi.uploadAvatar(userId, avatarFile, profile.bio, profile.location);
//         setUploading(false);
//       } else if (profile.bio || profile.location) {
//         await profileApi.update(userId, profile.bio, profile.location);
//       }
//     }

//     navigate(isEdit ? `/users/${userId}` : "/");
//   } catch (err) {
//     setError(err.response?.data?.detail || err.response?.data?.error || "Something went wrong");
//   } finally {
//     setLoading(false);
//     setUploading(false);
//   }
// }


//   // async function handleSubmit(e) {
//   //   e.preventDefault();
//   //   setLoading(true);
//   //   setError("");

//   //   try {
//   //     let userId = id;

//   //     if (isEdit) {
//   //       await userApi.update(id, form);
//   //     } else {
//   //       // 1. Create user
//   //       const { data: newUser } = await userApi.create(form);
//   //       userId = newUser.id;

//   //       // 2. Register auth credentials (Java service)
//   //       if (password) {
//   //         await authApi.register(userId, form.email, password, form.role);
//   //       }
//   //     }

//   //     // 3. Upload profile picture to S3 via Profile Service (if selected)
//   //     if (avatarFile) {
//   //       setUploading(true);
//   //       await profileApi.uploadAvatar(userId, avatarFile, profile.bio, profile.location);
//   //       setUploading(false);
//   //     } else if (profile.bio || profile.location) {
//   //       await profileApi.update(userId, profile.bio, profile.location);
//   //     }

//   //     navigate(isEdit ? `/users/${userId}` : "/");
//   //   } catch (err) {
//   //     setError(err.response?.data?.detail || err.response?.data?.error || "Something went wrong");
//   //   } finally {
//   //     setLoading(false);
//   //     setUploading(false);
//   //   }
//   // }

//   const avatarSrc = avatarPreview || currentAvatar;

//   return (
//     <div className="page">
//       <div className="page-header">
//         <h1>{isEdit ? "Edit User" : "Add New User"}</h1>
//       </div>

//       {error && <div className="error-banner">{error}</div>}

//       <form onSubmit={handleSubmit} className="form-card">
//         {/* Avatar Upload */}
//         <div className="avatar-upload-section">
//           <div
//             className="avatar-upload-target"
//             onClick={() => fileInputRef.current.click()}
//           >
//             {avatarSrc ? (
//               <img src={avatarSrc} alt="Profile" className="avatar-large" />
//             ) : (
//               <div className="avatar-placeholder-large">
//                 <span>📷</span>
//                 <small>Upload photo</small>
//               </div>
//             )}
//           </div>
//           <input
//             ref={fileInputRef}
//             type="file"
//             accept="image/*"
//             onChange={handleFileChange}
//             style={{ display: "none" }}
//           />
//           <p className="upload-hint">
//             {avatarFile
//               ? `Selected: ${avatarFile.name}`
//               : "Click to upload profile picture (stored in AWS S3)"}
//           </p>
//         </div>

//         {/* Basic Info */}
//         <div className="form-section">
//           <h3>Basic Information</h3>
//           <div className="form-row">
//             <label>Full Name *</label>
//             <input
//               type="text"
//               value={form.name}
//               onChange={(e) => setForm({ ...form, name: e.target.value })}
//               required placeholder="Jane Doe"
//             />
//           </div>
//           <div className="form-row">
//             <label>Email *</label>
//             <input
//               type="email"
//               value={form.email}
//               onChange={(e) => setForm({ ...form, email: e.target.value })}
//               required placeholder="jane@company.com"
//             />
//           </div>
//           {!isEdit && (
//             <div className="form-row">
//               <label>Password *</label>
//               <input
//                 type="password"
//                 value={password}
//                 onChange={(e) => setPassword(e.target.value)}
//                 required={!isEdit}
//                 placeholder="Min 8 characters"
//               />
//             </div>
//           )}
//           <div className="form-row">
//             <label>Phone</label>
//             <input
//               type="tel"
//               value={form.phone}
//               onChange={(e) => setForm({ ...form, phone: e.target.value })}
//               placeholder="+234 801 234 5678"
//             />
//           </div>
//           <div className="form-row">
//             <label>Department</label>
//             <input
//               type="text"
//               value={form.department}
//               onChange={(e) => setForm({ ...form, department: e.target.value })}
//               placeholder="Engineering"
//             />
//           </div>
//           <div className="form-row">
//             <label>Role</label>
//             <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
//               <option value="member">Member</option>
//               <option value="admin">Admin</option>
//               <option value="manager">Manager</option>
//             </select>
//           </div>
//         </div>

//         {/* Profile Info */}
//         <div className="form-section">
//           <h3>Profile Details</h3>
//           <div className="form-row">
//             <label>Bio</label>
//             <textarea
//               value={profile.bio}
//               onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
//               placeholder="Tell us about this person..."
//               rows={3}
//             />
//           </div>
//           <div className="form-row">
//             <label>Location</label>
//             <input
//               type="text"
//               value={profile.location}
//               onChange={(e) => setProfile({ ...profile, location: e.target.value })}
//               placeholder="Lagos, Nigeria"
//             />
//           </div>
//         </div>

//         <div className="form-actions">
//           <button type="button" onClick={() => navigate(-1)} className="btn btn-outline">
//             Cancel
//           </button>
//           <button type="submit" className="btn btn-primary" disabled={loading}>
//             {loading
//               ? uploading
//                 ? "Uploading to S3..."
//                 : "Saving..."
//               : isEdit ? "Save Changes" : "Create User"}
//           </button>
//         </div>
//       </form>
//     </div>
//   );
// }



import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { userApi, profileApi, authApi } from "../services/api";

export default function UserForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: "", email: "", phone: "", department: "", role: "member" });
  const [profile, setProfile] = useState({ bio: "", location: "" });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [currentAvatar, setCurrentAvatar] = useState(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef();

  useEffect(() => { if (isEdit) loadUser(); }, [id]);

  async function loadUser() {
    try {
      const { data: user } = await userApi.get(id);
      setForm({ name: user.name, email: user.email, phone: user.phone || "", department: user.department || "", role: user.role });
      try {
        const { data: prof } = await profileApi.get(id);
        setProfile({ bio: prof.bio || "", location: prof.location || "" });
        setCurrentAvatar(prof.avatar_url);
      } catch (_) {}
    } catch {
      setError("Failed to load user");
    }
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Image must be under 5MB"); return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      let userId = id;
      if (isEdit) {
        const updates = [userApi.update(id, form)];
        if (avatarFile) { setUploading(true); updates.push(profileApi.uploadAvatar(userId, avatarFile, profile.bio, profile.location)); }
        else if (profile.bio || profile.location) { updates.push(profileApi.update(userId, profile.bio, profile.location)); }
        await Promise.all(updates);
        setUploading(false);
      } else {
        const { data: newUser } = await userApi.create(form);
        userId = newUser.id;
        if (password) await authApi.register(userId, form.email, password, form.role);
        if (avatarFile) { setUploading(true); await profileApi.uploadAvatar(userId, avatarFile, profile.bio, profile.location); setUploading(false); }
        else if (profile.bio || profile.location) { await profileApi.update(userId, profile.bio, profile.location); }
      }
      navigate(isEdit ? `/users/${userId}` : "/");
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || "Something went wrong");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  }

  const avatarSrc = avatarPreview || currentAvatar;

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">👥</div>
          <div><span>ProfileZee</span><small>Admin Console</small></div>
        </div>
        <nav className="sidebar-nav" style={{ padding: "0 0.75rem" }}>
          <a href="/"><span className="sidebar-nav-icon">🏠</span> Dashboard</a>
          <a href="/users/new"><span className="sidebar-nav-icon">➕</span> Add User</a>
        </nav>
      </aside>

      <div className="main-content">
        <div className="topbar">
          <div className="topbar-title">
            <h2>{isEdit ? "Edit User" : "Add New User"}</h2>
            <p>{isEdit ? "Update user details and profile" : "Fill in details to create a new team member"}</p>
          </div>
          <button onClick={() => navigate(-1)} className="btn btn-outline">← Cancel</button>
        </div>

        <div className="page-body">
          {error && <div className="error-banner" style={{ marginBottom: "1rem" }}>{error}</div>}

          <form onSubmit={handleSubmit} className="form-card form-page">
            {/* AVATAR */}
            <div className="avatar-upload-section">
              <div className="avatar-upload-target" onClick={() => fileInputRef.current.click()}>
                {avatarSrc
                  ? <img src={avatarSrc} alt="Profile" className="avatar-large" />
                  : <div className="avatar-placeholder-large"><span style={{ fontSize: 28 }}>📷</span><small>Upload photo</small></div>}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
              <p className="upload-hint">
                {avatarFile ? `Selected: ${avatarFile.name}` : "Click to upload profile picture (stored in AWS S3)"}
              </p>
            </div>

            {/* BASIC INFO */}
            <div className="form-section">
              <h3>Basic Information</h3>
              <div className="form-row">
                <label>Full Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Jane Doe" />
              </div>
              <div className="form-row">
                <label>Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="jane@company.com" />
              </div>
              {!isEdit && (
                <div className="form-row">
                  <label>Password *</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={!isEdit} placeholder="Min 8 characters" />
                </div>
              )}
              <div className="form-row">
                <label>Phone</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+234 801 234 5678" />
              </div>
              <div className="form-row">
                <label>Department</label>
                <input type="text" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Engineering" />
              </div>
              <div className="form-row">
                <label>Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
            </div>

            {/* PROFILE */}
            <div className="form-section">
              <h3>Profile Details</h3>
              <div className="form-row">
                <label>Bio</label>
                <textarea value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} placeholder="Tell us about this person..." rows={3} />
              </div>
              <div className="form-row">
                <label>Location</label>
                <input type="text" value={profile.location} onChange={(e) => setProfile({ ...profile, location: e.target.value })} placeholder="Lagos, Nigeria" />
              </div>
            </div>

            <div className="form-actions">
              <button type="button" onClick={() => navigate(-1)} className="btn btn-outline">Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? (uploading ? "Uploading to S3..." : "Saving...") : isEdit ? "Save Changes" : "Create User"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}