// frontend/src/pages/LoginPage.tsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom"; // useNavigate is fine HERE
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const { loginUser, isLoadingAuth, authError } = useAuth();
  const navigate = useNavigate(); // Called within a route component - OK

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const loggedInUser = await loginUser({ emailOrUsername, password });
    if (loggedInUser) {
      navigate("/"); // Navigate on success
    }
    // authError will be displayed from context if loginUser sets it
  };

  // ... rest of your LoginPage JSX (form, error display, etc.) ...
  // (This part remains the same as the previous correct version)
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 p-8 rounded-xl shadow-2xl">
        <h2 className="text-3xl font-bold text-center text-sky-400 mb-8">
          Login
        </h2>
        {authError && (
          <p className="bg-red-500/30 text-red-300 p-3 rounded mb-4 text-sm">
            {authError}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="emailOrUsername"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Username or Email
            </label>
            <input
              id="emailOrUsername"
              type="text"
              autoComplete="username"
              required
              value={emailOrUsername}
              onChange={(e) => setEmailOrUsername(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="your_username or email@example.com"
              disabled={isLoadingAuth}
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="••••••••"
              disabled={isLoadingAuth}
            />
          </div>
          <div>
            <button
              type="submit"
              className="w-full py-3 px-4 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-lg shadow-md transition-transform duration-150 ease-in-out transform hover:scale-102 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50 disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={isLoadingAuth}
            >
              {isLoadingAuth ? "Signing In..." : "Sign In"}
            </button>
          </div>
        </form>
        <p className="mt-8 text-center text-sm text-gray-400">
          Don't have an account?{" "}
          <Link
            to="/signup"
            className="font-medium text-sky-400 hover:text-sky-300"
          >
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  );
}
