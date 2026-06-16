import { useEffect, useState } from "react";
import { RefreshCw, UserPlus, Trash2, Edit2, X } from "lucide-react";
import { getUsers, createUser, deleteUser, updateUser } from "../api";

const padNum = (num, length = 2) => String(num).padStart(length, "0");

export default function UserManagementView({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterText, setFilterText] = useState("");

  // Add User Form Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(false);

  // Edit User Form Modal State
  const [editingUser, setEditingUser] = useState(null); // stores user being edited or null
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("user");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      setError(err.message || "Failed to load user list.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(false);
    setFormLoading(true);

    try {
      await createUser(username, password, role);
      setFormSuccess(true);
      setUsername("");
      setPassword("");
      setRole("user");
      setShowAddModal(false);
      fetchUsers();
      
      // Flash a success window alert or state
      alert("User registered successfully.");
    } catch (err) {
      setFormError(err.message || "Failed to create user.");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleEditUser(e) {
    e.preventDefault();
    setEditError(null);
    setEditLoading(true);

    try {
      await updateUser(editingUser.id, editPassword || null, editRole);
      setEditingUser(null);
      setEditPassword("");
      setEditRole("user");
      fetchUsers();
      alert("User updated successfully.");
    } catch (err) {
      setEditError(err.message || "Failed to update user.");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteUser(id, name) {
    if (id === currentUser.id) {
      alert("Self-deletion is forbidden. You cannot delete your own logged-in account.");
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete user '${name}'? All their sessions and extraction records will be deleted.`)) {
      return;
    }
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      alert("Failed to delete user: " + err.message);
    }
  }

  function startEdit(u) {
    setEditingUser(u);
    setEditRole(u.role);
    setEditPassword("");
    setEditError(null);
  }

  // Filter list
  const filteredUsers = users.filter((u) => 
    u.username.toLowerCase().includes(filterText.toLowerCase())
  );

  if (loading) {
    return (
      <div className="history-loading-container">
        <div className="pg-spinner" style={{ fontSize: "28px" }}>⋯</div>
        <p>Loading user list...</p>
      </div>
    );
  }

  return (
    <div className="history-view-container">
      <div className="results-head" style={{ marginBottom: "16px", borderBottom: "none" }}>
        <div>
          <h2>👥 USER ADMINISTRATION</h2>
          <p style={{ fontSize: "11px", color: "var(--fg-dim)", marginTop: "4px" }}>
            Add, edit, filter, and remove credentials accounts. Changes take effect immediately.
          </p>
        </div>
        <button 
          className="btn ghost small" 
          onClick={fetchUsers}
          style={{ display: "inline-flex", gap: "6px", height: "28px" }}
        >
          <RefreshCw size={12} />
          <span>REFRESH LIST</span>
        </button>
      </div>

      {error && (
        <div className="viewer-error" style={{ borderRadius: "2px", marginBottom: "16px" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Toolbar: Filter search on left, Add User button on right */}
      <div className="table-actions-toolbar" style={{ display: "flex", gap: "12px", marginBottom: "16px", flexShrink: 0, justifyContent: "space-between", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Filter by username..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="custom-form-input"
          style={{ height: "32px", fontSize: "12px", maxWidth: "280px" }}
        />
        <button 
          className="btn primary small" 
          onClick={() => {
            setShowAddModal(true);
            setFormError(null);
            setFormSuccess(false);
            setUsername("");
            setPassword("");
            setRole("user");
          }}
          style={{ display: "inline-flex", gap: "6px", height: "32px", fontSize: "11px" }}
        >
          <UserPlus size={14} />
          <span>ADD USER</span>
        </button>
      </div>

      {/* Users List Table */}
      <div className="user-list-card" style={{ width: "100%" }}>
        <table className="results-table">
          <thead>
            <tr>
              <th style={{ width: "80px" }}>ID</th>
              <th>USERNAME</th>
              <th style={{ width: "200px" }}>ACCESS PRIVILEGE</th>
              <th style={{ textAlign: "right", width: "220px" }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={4} className="no-results">
                  No accounts found matching filter.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const isSelf = u.id === currentUser.id;
                return (
                  <tr key={u.id}>
                    <td style={{ color: "var(--fg-dim)" }}>#{padNum(u.id, 3)}</td>
                    <td style={{ fontWeight: "700" }}>
                      {u.username} {isSelf && <span className="self-tag">(You)</span>}
                    </td>
                    <td>
                      <span className={`role-tag ${u.role}`}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "6px" }}>
                        <button
                          className="btn ghost small"
                          onClick={() => startEdit(u)}
                          style={{ display: "inline-flex", gap: "4px", height: "26px" }}
                        >
                          <Edit2 size={12} />
                          <span>EDIT</span>
                        </button>
                        <button
                          className="btn ghost small"
                          onClick={() => handleDeleteUser(u.id, u.username)}
                          disabled={isSelf}
                          style={{
                            display: "inline-flex",
                            gap: "4px",
                            color: isSelf ? "var(--fg-dim)" : "var(--err)",
                            borderColor: isSelf ? "var(--line)" : "rgba(248,81,73,0.2)",
                            height: "26px",
                            opacity: isSelf ? 0.3 : 1,
                            cursor: isSelf ? "not-allowed" : "pointer"
                          }}
                        >
                          <Trash2 size={12} />
                          <span>DELETE</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL Popup 1: Add User */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add User</h3>
              <button className="icon-btn" style={{ border: "none", background: "transparent" }} onClick={() => setShowAddModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="modal-add-username" className="t-eyebrow">Username</label>
                  <input
                    id="modal-add-username"
                    type="text"
                    placeholder="Enter username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    disabled={formLoading}
                    className="custom-form-input"
                  />
                </div>

                <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="modal-add-password" className="t-eyebrow">Password</label>
                  <input
                    id="modal-add-password"
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={formLoading}
                    className="custom-form-input"
                  />
                </div>

                <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="modal-add-role" className="t-eyebrow">System Role</label>
                  <select
                    id="modal-add-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    disabled={formLoading}
                    className="custom-form-select"
                  >
                    <option value="user">Standard User (restricted)</option>
                    <option value="admin">Administrator (full control)</option>
                  </select>
                </div>

                {formError && (
                  <div className="auth-error-banner" style={{ marginTop: "4px" }}>
                    <span className="error-message">{formError}</span>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn ghost" onClick={() => setShowAddModal(false)} disabled={formLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={formLoading}>
                  {formLoading ? "Registering..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL Popup 2: Edit User */}
      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit User: {editingUser.username}</h3>
              <button className="icon-btn" style={{ border: "none", background: "transparent" }} onClick={() => setEditingUser(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleEditUser}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label className="t-eyebrow">Username</label>
                  <input
                    type="text"
                    value={editingUser.username}
                    disabled
                    className="custom-form-input"
                    style={{ opacity: 0.5, cursor: "not-allowed" }}
                  />
                </div>

                <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="modal-edit-password" className="t-eyebrow">Password</label>
                  <input
                    id="modal-edit-password"
                    type="password"
                    placeholder="Leave blank to keep current"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    disabled={editLoading}
                    className="custom-form-input"
                  />
                </div>

                <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="modal-edit-role" className="t-eyebrow">System Role</label>
                  <select
                    id="modal-edit-role"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    disabled={editLoading || editingUser.id === currentUser.id}
                    className="custom-form-select"
                  >
                    <option value="user">Standard User (restricted)</option>
                    <option value="admin">Administrator (full control)</option>
                  </select>
                  {editingUser.id === currentUser.id && (
                    <span style={{ fontSize: "10px", color: "var(--fg-dim)", marginTop: "2px" }}>
                      * Role changes on your own account are disabled to prevent admin lockouts.
                    </span>
                  )}
                </div>

                {editError && (
                  <div className="auth-error-banner" style={{ marginTop: "4px" }}>
                    <span className="error-message">{editError}</span>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn ghost" onClick={() => setEditingUser(null)} disabled={editLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={editLoading}>
                  {editLoading ? "Updating..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
