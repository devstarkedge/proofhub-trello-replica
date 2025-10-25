import React, { useState, useContext } from "react";
import AuthContext from "../context/AuthContext";
import api from "../services/api";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";

const AdminSettings = () => {
  const { user, token, getProfile } = useContext(AuthContext);
  const [formData, setFormData] = useState({
    newEmail: "",
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const { newEmail, currentPassword, newPassword, confirmNewPassword } =
    formData;

  const onChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword && newPassword !== confirmNewPassword) {
      setError("New passwords do not match.");
      return;
    }

    try {
      const config = {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      };

      const body = {};
      if (newEmail) body.newEmail = newEmail;
      if (currentPassword) body.currentPassword = currentPassword;
      if (newPassword) body.newPassword = newPassword;

      const res = await api.put("/api/admin/settings", body, config);

      setMessage(res.data.message);
      // Refresh user profile to get updated info
      getProfile();
      // Clear form
      setFormData({
        newEmail: "",
        currentPassword: "",
        newPassword: "",
        confirmNewPassword: "",
      });
    } catch (err) {
      setError(err.response?.data?.message || "An error occurred.");
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 ml-64">
        <Header />
        <main className="p-6">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">
              Admin Settings
            </h1>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl mb-2">Update Your Settings</h2>
              <p className="mb-4 text-gray-600">
                Current Email: <strong>{user?.email}</strong>
              </p>

              {message && (
                <div
                  className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4"
                  role="alert"
                >
                  {message}
                </div>
              )}
              {error && (
                <div
                  className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <form onSubmit={onSubmit}>
                <div className="mb-4">
                  <label
                    className="block text-gray-700 text-sm font-bold mb-2"
                    htmlFor="newEmail"
                  >
                    New Email Address
                  </label>
                  <input
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    id="newEmail"
                    type="email"
                    placeholder="Enter new email (optional)"
                    name="newEmail"
                    value={newEmail}
                    onChange={onChange}
                  />
                </div>

                <hr className="my-6" />

                <h3 className="text-lg font-semibold mb-4">Change Password</h3>

                <div className="mb-4">
                  <label
                    className="block text-gray-700 text-sm font-bold mb-2"
                    htmlFor="currentPassword"
                  >
                    Current Password
                  </label>
                  <input
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    id="currentPassword"
                    type="password"
                    placeholder="Enter current password"
                    name="currentPassword"
                    value={currentPassword}
                    onChange={onChange}
                    required={newPassword ? true : false}
                  />
                </div>

                <div className="mb-4">
                  <label
                    className="block text-gray-700 text-sm font-bold mb-2"
                    htmlFor="newPassword"
                  >
                    New Password
                  </label>
                  <input
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    id="newPassword"
                    type="password"
                    placeholder="Enter new password"
                    name="newPassword"
                    value={newPassword}
                    onChange={onChange}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Min 8 characters, with uppercase, lowercase, number, and
                    special character.
                  </p>
                </div>

                <div className="mb-6">
                  <label
                    className="block text-gray-700 text-sm font-bold mb-2"
                    htmlFor="confirmNewPassword"
                  >
                    Confirm New Password
                  </label>
                  <input
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline"
                    id="confirmNewPassword"
                    type="password"
                    placeholder="Confirm new password"
                    name="confirmNewPassword"
                    value={confirmNewPassword}
                    onChange={onChange}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <button
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                    type="submit"
                  >
                    Update Settings
                  </button>
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminSettings;
