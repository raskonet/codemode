import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { LogIn, Loader2, UserCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function LoginPage() {
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const { loginUser, isLoadingAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOrUsername || !password) {
      toast.error("Please fill in all fields.");
      return;
    }
    const loggedInUser = await loginUser({ emailOrUsername, password });
    if (loggedInUser) {
      toast.success(`Welcome back, ${loggedInUser.username}!`);
      navigate(from, { replace: true });
    } else {
      toast.error("Login failed. Please check your credentials.");
    }
  };

  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700">
        <div className="text-center mb-8">
          <UserCircle size={48} className="mx-auto text-sky-400 mb-3" />
          <h2 className="text-3xl font-bold text-gray-100">Member Login</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="emailOrUsername"
              className="block text-sm font-medium text-gray-300 mb-1.5"
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
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-shadow"
              placeholder="your_username or email@example.com"
              disabled={isLoadingAuth}
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-300 mb-1.5"
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
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-shadow"
              placeholder="••••••••"
              disabled={isLoadingAuth}
            />
          </div>
          <div>
            <button
              type="submit"
              className="w-full btn btn-primary text-lg flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={isLoadingAuth}
            >
              {isLoadingAuth ? (
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
              ) : (
                <LogIn size={20} className="mr-2" />
              )}
              {isLoadingAuth ? "Signing In..." : "Sign In"}
            </button>
          </div>
        </form>
        <p className="mt-8 text-center text-sm text-gray-400">
          Don't have an account?{" "}
          <Link
            to="/signup"
            className="font-medium text-sky-400 hover:text-sky-300 hover:underline transition-colors"
          >
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  );
}
