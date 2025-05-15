import React from "react";
import { Link, NavLink } from "react-router-dom";
import {
  User,
  LogIn,
  LogOut,
  UserPlus,
  Loader2,
  Swords,
  Trophy,
  Hammer,
  LayoutDashboard,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export default function Navbar() {
  const { isAuthenticated, user, logoutUser, isLoadingAuth } = useAuth();

  const handleLogout = async () => {
    await logoutUser();
  };

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `text-sm md:text-base px-3 py-2 rounded-md transition-all duration-150 ease-in-out flex items-center space-x-2
     ${
       isActive
         ? "bg-sky-500 text-white shadow-sm"
         : "text-gray-300 hover:bg-gray-700 hover:text-sky-300"
     }`;

  return (
    <div className="flex items-center justify-between px-4 md:px-8 py-3 bg-gray-800 shadow-lg text-gray-200 sticky top-0 z-50">
      <Link to="/" className="flex items-center space-x-2 group">
        <Swords
          size={30}
          className="text-sky-400 group-hover:text-sky-300 transition-colors duration-200 transform group-hover:rotate-[-5deg]"
        />
        <h1 className="text-xl md:text-2xl font-bold tracking-tight group-hover:text-sky-300 transition-colors duration-200">
          CodingDuels
        </h1>
      </Link>
      <nav className="flex items-center space-x-1 md:space-x-2">
        <NavLink to="/compete" className={navLinkClasses}>
          <Swords size={18} /> <span>Compete</span>
        </NavLink>
        <NavLink to="/problems" className={navLinkClasses}>
          <Hammer size={18} /> <span>Problems</span>
        </NavLink>
        <NavLink to="/tournaments" className={navLinkClasses}>
          <Trophy size={18} /> <span>Tournaments</span>
        </NavLink>

        {isLoadingAuth ? (
          <div className="flex items-center px-3 py-2">
            <Loader2 size={20} className="animate-spin text-sky-400" />
          </div>
        ) : isAuthenticated ? (
          <>
            <NavLink to="/user" className={navLinkClasses}>
              <User size={18} />
              <span>{user?.username}</span>
            </NavLink>
            <button
              onClick={handleLogout}
              className="btn btn-danger btn-sm flex items-center space-x-1"
            >
              <LogOut size={18} />
              <span className="hidden md:inline">Logout</span>
            </button>
          </>
        ) : (
          <>
            <NavLink
              to="/login"
              className="text-sm md:text-base px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-sky-300 transition-colors duration-150 flex items-center space-x-1"
            >
              <LogIn size={18} />
              <span>Login</span>
            </NavLink>
            <Link
              to="/signup"
              className="btn btn-success btn-sm flex items-center space-x-1"
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
