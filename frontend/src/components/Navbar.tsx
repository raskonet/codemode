// frontend/src/components/Navbar.tsx
import React from "react";
import { Link } from "react-router-dom";
import {
  User,
  Code,
  LogIn,
  LogOut,
  UserPlus,
  Loader2,
  Swords,
  Trophy,
} from "lucide-react"; // Added Trophy
import { useAuth } from "../hooks/useAuth";

export default function Navbar() {
  const { isAuthenticated, user, logoutUser, isLoadingAuth } = useAuth();

  const handleLogout = async () => {
    await logoutUser();
    // Navigation to /login is now handled by the component that calls logoutUser,
    // or by a global effect listening to isAuthenticated state.
  };

  return (
    <div className="flex items-center justify-between px-4 md:px-8 py-3 bg-gray-800 shadow-md text-gray-200">
      <Link
        to="/"
        className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
      >
        <Swords size={30} className="text-sky-400" /> {/* Changed Icon */}
        <h1 className="text-xl md:text-2xl font-semibold">Coding Duels</h1>
      </Link>
      <nav className="flex items-center space-x-2 md:space-x-4">
        <Link
          to="/compete"
          className="text-sm md:text-base hover:text-sky-400 transition-colors px-2 py-1.5 md:px-3 rounded-md hover:bg-gray-700"
        >
          Compete
        </Link>
        <Link
          to="/problems"
          className="text-sm md:text-base hover:text-sky-400 transition-colors px-2 py-1.5 md:px-3 rounded-md hover:bg-gray-700"
        >
          Problems
        </Link>
        <Link
          to="/tournaments"
          className="text-sm md:text-base hover:text-sky-400 transition-colors px-2 py-1.5 md:px-3 rounded-md hover:bg-gray-700 flex items-center"
        >
          <Trophy size={16} className="mr-1 md:mr-2" /> Tournaments
        </Link>

        {isLoadingAuth ? (
          <div className="flex items-center px-3 py-1.5">
            <Loader2 size={18} className="animate-spin text-sky-400" />
          </div>
        ) : isAuthenticated ? (
          <>
            <Link
              to="/user"
              className="flex items-center space-x-1 text-sm md:text-base hover:text-sky-400 transition-colors px-2 py-1.5 md:px-3 rounded-md hover:bg-gray-700"
            >
              <User size={18} />
              <span>{user?.username}</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 text-sm md:text-base bg-red-500 hover:bg-red-600 text-white font-medium px-2 py-1.5 md:px-3 rounded-md transition-colors"
            >
              <LogOut size={18} />
              <span className="hidden md:inline">Logout</span>
            </button>
          </>
        ) : (
          <>
            <Link
              to="/login"
              className="flex items-center space-x-1 text-sm md:text-base hover:text-sky-400 transition-colors px-2 py-1.5 md:px-3 rounded-md hover:bg-gray-700"
            >
              <LogIn size={18} />
              <span>Login</span>
            </Link>
            <Link
              to="/signup"
              className="flex items-center space-x-1 text-sm md:text-base bg-green-500 hover:bg-green-600 text-white font-medium px-2 py-1.5 md:px-3 rounded-md transition-colors"
            >
              <UserPlus size={18} />
              <span>Sign Up</span>
            </Link>
          </>
        )}
      </nav>
    </div>
  );
}
