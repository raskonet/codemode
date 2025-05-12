// frontend/src/components/Navbar.tsx
import React from "react";
import { Link, useNavigate } from "react-router-dom"; // useNavigate is fine HERE
import { User, Code, LogIn, LogOut, UserPlus, Loader2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export default function Navbar() {
  const { isAuthenticated, user, logoutUser, isLoadingAuth } = useAuth();
  const navigate = useNavigate(); // Called within a component rendered by Router - OK

  const handleLogout = async () => {
    const success = await logoutUser();
    if (success) {
      navigate("/login"); // Navigate on successful logout
    }
    // If logout fails, authError will be set in context and could be displayed elsewhere
  };

  // ... rest of your Navbar JSX ...
  // (This part remains the same as the previous correct version)
  return (
    <div className="flex items-center justify-between px-4 md:px-8 py-3 bg-gray-800 shadow-md text-gray-200">
      <Link
        to="/"
        className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
      >
        <Code size={30} className="text-sky-400" />
        <h1 className="text-xl md:text-2xl font-semibold">Coding Duels</h1>
      </Link>
      <nav className="flex items-center space-x-3 md:space-x-5">
        <Link
          to="/compete"
          className="text-sm md:text-base hover:text-sky-400 transition-colors px-3 py-1.5 rounded-md hover:bg-gray-700"
        >
          Compete
        </Link>
        <Link
          to="/problems"
          className="text-sm md:text-base hover:text-sky-400 transition-colors px-3 py-1.5 rounded-md hover:bg-gray-700"
        >
          Problems
        </Link>

        {isLoadingAuth ? (
          <div className="flex items-center px-3 py-1.5">
            <Loader2 size={18} className="animate-spin text-sky-400" />
          </div>
        ) : isAuthenticated ? (
          <>
            <Link
              to="/user"
              className="flex items-center space-x-1 text-sm md:text-base hover:text-sky-400 transition-colors px-3 py-1.5 rounded-md hover:bg-gray-700"
            >
              <User size={18} />
              <span>{user?.username}</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 text-sm md:text-base bg-red-500 hover:bg-red-600 text-white font-medium px-3 py-1.5 rounded-md transition-colors"
            >
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </>
        ) : (
          <>
            <Link
              to="/login"
              className="flex items-center space-x-1 text-sm md:text-base hover:text-sky-400 transition-colors px-3 py-1.5 rounded-md hover:bg-gray-700"
            >
              <LogIn size={18} />
              <span>Login</span>
            </Link>
            <Link
              to="/signup"
              className="flex items-center space-x-1 text-sm md:text-base bg-green-500 hover:bg-green-600 text-white font-medium px-3 py-1.5 rounded-md transition-colors"
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
