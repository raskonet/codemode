// frontend/src/pages/SignupPage.tsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom"; // useNavigate is fine HERE
import { useAuth } from "../hooks/useAuth";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { signupUser, isLoadingAuth, authError } = useAuth();
  const navigate = useNavigate(); // Called within a route component - OK

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert("Passwords do not match!"); // Or set a local error state
      return;
    }
    const signedUpUser = await signupUser({ username, email, password });
    if (signedUpUser) {
      navigate("/"); // Navigate on success
    }
    // authError will be displayed from context if signupUser sets it
  };

  // ... rest of your SignupPage JSX (form, error display, etc.) ...
  // (This part remains the same as the previous correct version)
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 p-8 rounded-xl shadow-2xl">
        <h2 className="text-3xl font-bold text-center text-sky-400 mb-8">
          Create Account
        </h2>
        {authError && (
          <p className="bg-red-500/30 text-red-300 p-3 rounded mb-4 text-sm">
            {authError}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Choose a username"
              disabled={isLoadingAuth}
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="you@example.com"
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
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="•••••••• (min 6 chars)"
              disabled={isLoadingAuth}
            />
          </div>
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="••••••••"
              disabled={isLoadingAuth}
            />
          </div>
          <div>
            <button
              type="submit"
              className="w-full py-3 px-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg shadow-md transition-transform duration-150 ease-in-out transform hover:scale-102 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={isLoadingAuth}
            >
              {isLoadingAuth ? "Signing Up..." : "Sign Up"}
            </button>
          </div>
        </form>
        <p className="mt-8 text-center text-sm text-gray-400">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-sky-400 hover:text-sky-300"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
