import axios from "axios";

// Reads from .env file at build time.
// REACT_APP_API_URL defaults to port 18080 to match docker-compose.yml
const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:18080/api";
const API = axios.create({ baseURL: BASE_URL });

// ─── User Service (FastAPI :8001) ─────────────────────────────────────
export const userApi = {
  list: () => API.get("/users"),
  get: (id) => API.get(`/users/${id}`),
  create: (data) => API.post("/users", data),
  update: (id, data) => API.put(`/users/${id}`, data),
  delete: (id) => API.delete(`/users/${id}`),
};

// ─── Profile Service (FastAPI :8002) ──────────────────────────────────
export const profileApi = {
  get: (userId) => API.get(`/profiles/${userId}`),

  uploadAvatar: (userId, file, bio, location) => {
    const form = new FormData();
    form.append("file", file);
    if (bio) form.append("bio", bio);
    if (location) form.append("location", location);
    return API.post(`/profiles/${userId}/avatar`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  update: (userId, bio, location) => {
    const form = new FormData();
    if (bio !== undefined) form.append("bio", bio);
    if (location !== undefined) form.append("location", location);
    return API.put(`/profiles/${userId}`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  deleteAvatar: (userId) => API.delete(`/profiles/${userId}/avatar`),
};

// ─── Auth Service (Java Spring Boot :8003) ────────────────────────────
export const authApi = {
  register: (userId, email, password, role) =>
    API.post("/auth/register", { userId, email, password, role }),
  login: (email, password) => API.post("/auth/login", { email, password }),
  validate: (token) => API.post("/auth/validate", { token }),
  logout: (userId) => API.post(`/auth/logout/${userId}`),
};
