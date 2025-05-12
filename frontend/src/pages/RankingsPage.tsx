import React from "react";

export default function RankingsPage() {
  // Ensure 'default' keyword is here
  return (
    <div className="p-4">
      <h1 className="text-2xl text-white">Rankings</h1>
      <p className="text-gray-300">
        Leaderboard and user rankings will be displayed here.
      </p>
      {/* Placeholder content */}
      <ul className="mt-4 text-gray-400">
        <li>1. TopCoder123 - 2500 Elo</li>
        <li>2. CodeNinja - 2450 Elo</li>
        <li>3. AlgoMaster - 2400 Elo</li>
      </ul>
    </div>
  );
}
