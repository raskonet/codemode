import { useParams, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  UserCircle,
  BarChart2,
  Settings,
  LogIn,
  AlertTriangle,
} from "lucide-react";

export default function ProfilePage() {
  const { userId: routeUserId } = useParams<{ userId: string }>();
  const { user: authUser, isAuthenticated, isLoadingAuth } = useAuth();

  const isOwnProfile =
    !routeUserId || (authUser && routeUserId === authUser.id);
  const displayedUser = isOwnProfile ? authUser : null; // Simplification: only show full details for own profile for now
 // const profileTitle = isOwnProfile
 //   ? authUser?.username
  //  : `User ${routeUserId}`;

  if (isLoadingAuth) {
    return (
      <div className="p-6 text-center text-gray-300">Loading profile...</div>
    );
  }

  if (!isAuthenticated && !routeUserId) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 min-h-[calc(100vh-120px)]">
        <AlertTriangle size={48} className="text-yellow-400 mb-4" />
        <h2 className="text-2xl font-semibold mb-3 text-gray-100">
          Profile Access Denied
        </h2>
        <p className="text-gray-400 mb-6">
          Please log in to view your profile or specify a user ID to view a
          public profile.
        </p>
        <Link to="/login" className="btn btn-primary">
          <LogIn size={18} className="mr-2" /> Go to Login
        </Link>
      </div>
    );
  }

  if (!displayedUser && routeUserId) {
    // Logic to fetch public profile for routeUserId would go here
    // For now, show a simplified message
    return (
      <div className="p-6 text-center">
        <UserCircle size={64} className="mx-auto mb-4 text-sky-400" />
        <h1 className="text-3xl font-bold text-gray-100 mb-2">
          Profile: User {routeUserId}
        </h1>
        <p className="text-gray-400">
          Public profile view is under construction. Detailed stats for other
          users will be available soon!
        </p>
      </div>
    );
  }

  if (!displayedUser && !routeUserId) {
    // Should be caught by !isAuthenticated check, but as a fallback
    return (
      <div className="p-6 text-center text-gray-400">
        User not found or not logged in.
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="card bg-gray-800 p-6 md:p-8 rounded-xl shadow-2xl">
        <div className="flex flex-col md:flex-row items-center md:items-start mb-8">
          <UserCircle
            size={96}
            className="text-sky-400 mb-4 md:mb-0 md:mr-8 flex-shrink-0"
          />
          <div>
            <h1 className="text-4xl font-bold text-gray-100 mb-1 text-center md:text-left">
              {displayedUser?.username}
            </h1>
            <p className="text-gray-400 text-sm text-center md:text-left">
              Member since{" "}
              {new Date(
                displayedUser?.createdAt || Date.now(),
              ).toLocaleDateString()}
            </p>
            {/* Placeholder for email, consider privacy */}
            {/* <p className="text-gray-500 text-xs">{displayedUser?.email}</p> */}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gray-700/50 p-5 rounded-lg">
            <h3 className="text-lg font-semibold text-sky-300 mb-2 flex items-center">
              <BarChart2 size={20} className="mr-2" /> Statistics
            </h3>
            <ul className="space-y-1.5 text-gray-300 text-sm">
              <li>
                Rating:{" "}
                <span className="font-semibold text-yellow-400">
                  {displayedUser?.rating || 1500}
                </span>
              </li>
              <li>
                Duels Played:{" "}
                <span className="font-semibold">25 (Placeholder)</span>
              </li>
              <li>
                Duels Won:{" "}
                <span className="font-semibold">15 (Placeholder)</span>
              </li>
              <li>
                Problems Solved:{" "}
                <span className="font-semibold">50 (Placeholder)</span>
              </li>
            </ul>
          </div>
          <div className="bg-gray-700/50 p-5 rounded-lg">
            <h3 className="text-lg font-semibold text-sky-300 mb-2 flex items-center">
              <Settings size={20} className="mr-2" /> Account
            </h3>
            <p className="text-gray-400 text-sm mb-3">
              Account settings and management options will be available here.
            </p>
            <button
              className="btn btn-secondary btn-sm disabled:opacity-50"
              disabled
            >
              Edit Profile (Soon)
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-semibold text-gray-200 mb-3">
            Recent Activity (Placeholder)
          </h3>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-700/30 p-3 rounded-md text-sm">
                <p className="text-gray-300">
                  Solved "Two Sum" in a duel against " соперник{i} " -{" "}
                  <span className="text-green-400">Won (+15 Elo)</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">2 days ago</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
