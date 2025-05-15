import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { UserPlus, Loader2, Mail, KeyRound, User } from "lucide-react";
import toast from "react-hot-toast";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { signupUser, isLoadingAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !email || !password || !confirmPassword) {
      toast.error("Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match!");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }

    const signedUpUser = await signupUser({ username, email, password });
    if (signedUpUser) {
      toast.success(`Welcome, ${signedUpUser.username}! Account created.`);
      navigate(from, { replace: true });
    }
    // signupUser in AuthContext should handle its own error toasts
  };

  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700">
        <div className="text-center mb-8">
          <UserPlus size={48} className="mx-auto text-sky-400 mb-3" />
          <h2 className="text-3xl font-bold text-gray-100">
            Create Your Account
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center"
            >
              <User size={16} className="mr-2 text-gray-400" /> Username
            </label>
            <input
              id="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Choose a unique username"
              disabled={isLoadingAuth}
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center"
            >
              <Mail size={16} className="mr-2 text-gray-400" /> Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="you@example.com"
              disabled={isLoadingAuth}
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center"
            >
              <KeyRound size={16} className="mr-2 text-gray-400" /> Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="•••••••• (min 6 chars)"
              disabled={isLoadingAuth}
            />
          </div>
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center"
            >
              <KeyRound size={16} className="mr-2 text-gray-400" /> Confirm
              Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="••••••••"
              disabled={isLoadingAuth}
            />
          </div>
          <div>
            <button
              type="submit"
              className="w-full btn btn-success text-lg flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={isLoadingAuth}
            >
              {isLoadingAuth ? (
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
              ) : (
                <UserPlus size={20} className="mr-2" />
              )}
              {isLoadingAuth ? "Creating Account..." : "Sign Up"}
            </button>
          </div>
        </form>
        <p className="mt-8 text-center text-sm text-gray-400">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-sky-400 hover:text-sky-300 hover:underline transition-colors"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
