import axios from "axios";

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:18080/api";

const API = axios.create({ baseURL: BASE_URL });

// Attach JWT token to every request automatically
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If token expires or is invalid, redirect to login
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export const userApi = {
  list: () => API.get("/users"),
  get: (id) => API.get(`/users/${id}`),
  create: (data) => API.post("/users", data),
  update: (id, data) => API.put(`/users/${id}`, data),
  delete: (id) => API.delete(`/users/${id}`),
};

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

export const authApi = {
  register: (userId, email, password, role) =>
    API.post("/auth/register", { userId, email, password, role }),
  login: (email, password) => API.post("/auth/login", { email, password }),
  validate: (token) => API.post("/auth/validate", { token }),
  logout: (userId) => API.post(`/auth/logout/${userId}`),
};

// Helper to get current logged in user from localStorage
export const getCurrentUser = () => {
  const user = localStorage.getItem("user");
  return user ? JSON.parse(user) : null;
};

export const isAdmin = () => {
  const user = getCurrentUser();
  return user?.role === "admin" || user?.role === "superadmin";
};

export const isSuperAdmin = () => {
  const user = getCurrentUser();
  return user?.role === "superadmin";
};