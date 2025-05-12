import React from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth"; // Adjust path as needed

export default function ProfilePage() {
  // Default export
  const { userId: routeUserId } = useParams<{ userId: string }>();
  const { user: authUser, isAuthenticated } = useAuth();

  const displayedUserId = routeUserId || authUser?.id;
  const displayedUsername = routeUserId
    ? `User ${routeUserId}`
    : authUser?.username;

  if (!isAuthenticated && !routeUserId) {
    return (
      <div className="p-4 text-white">
        <p>Please log in to see your profile.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl text-white">
        Profile: {displayedUsername || "User"}
      </h1>
      <p className="text-gray-300">
        User statistics, submission history, and settings will go here.
      </p>
      {displayedUserId && (
        <p className="text-gray-400 text-sm mt-2">
          Displaying profile for ID: {displayedUserId}
        </p>
      )}
      {/* Placeholder content */}
      <div className="mt-4 text-gray-400">
        <p>Rating: 1500</p>
        <p>Problems Solved: 10</p>
        <p>Duels Won: 5</p>
      </div>
    </div>
  );
}
