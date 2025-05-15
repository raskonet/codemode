import React from "react";
import { BarChart, Crown, ShieldAlert, UserCircle } from "lucide-react";

const dummyRankings = [
  {
    rank: 1,
    username: "DuelMasterX",
    rating: 2850,
    duels: 150,
    winRate: "75%",
  },
  {
    rank: 2,
    username: "CodeNinjaElite",
    rating: 2780,
    duels: 120,
    winRate: "80%",
  },
  { rank: 3, username: "AlgoQueen", rating: 2750, duels: 135, winRate: "72%" },
  {
    rank: 4,
    username: "ByteSorcerer",
    rating: 2690,
    duels: 110,
    winRate: "78%",
  },
  {
    rank: 5,
    username: "SyntaxSlayer",
    rating: 2650,
    duels: 100,
    winRate: "70%",
  },
  { rank: 6, username: "LogicLlama", rating: 2600, duels: 95, winRate: "68%" },
  {
    rank: 7,
    username: "RecursiveRaptor",
    rating: 2550,
    duels: 90,
    winRate: "65%",
  },
];

export default function RankingsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-center mb-10">
        <BarChart size={36} className="mr-3 text-sky-400" />
        <h1 className="text-4xl font-bold text-gray-100">Global Rankings</h1>
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 px-4 py-3 rounded-lg mb-8 flex items-start space-x-3 text-sm">
        <ShieldAlert size={20} className="flex-shrink-0 mt-0.5" />
        <p>
          The ranking system is currently in beta and uses placeholder data. Elo
          calculations and leaderboard updates will be fully implemented soon.
        </p>
      </div>

      <div className="overflow-x-auto card bg-gray-800 shadow-2xl rounded-xl p-0 md:p-2">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700/50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3.5 text-left text-sm font-semibold text-sky-300"
              >
                Rank
              </th>
              <th
                scope="col"
                className="px-4 py-3.5 text-left text-sm font-semibold text-sky-300"
              >
                Player
              </th>
              <th
                scope="col"
                className="px-4 py-3.5 text-left text-sm font-semibold text-sky-300"
              >
                Rating
              </th>
              <th
                scope="col"
                className="px-4 py-3.5 text-left text-sm font-semibold text-sky-300 hidden md:table-cell"
              >
                Duels Played
              </th>
              <th
                scope="col"
                className="px-4 py-3.5 text-left text-sm font-semibold text-sky-300 hidden md:table-cell"
              >
                Win Rate
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/70 bg-gray-800">
            {dummyRankings.map((player, index) => (
              <tr
                key={player.username}
                className="hover:bg-gray-700/40 transition-colors"
              >
                <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium text-gray-200">
                  {player.rank === 1 ? (
                    <Crown size={18} className="text-yellow-400 inline -mt-1" />
                  ) : (
                    player.rank
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-200">
                  <div className="flex items-center">
                    <UserCircle size={20} className="mr-2 text-gray-500" />
                    {player.username}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-sm text-yellow-400 font-semibold">
                  {player.rating}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-300 hidden md:table-cell">
                  {player.duels}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-300 hidden md:table-cell">
                  {player.winRate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-center text-xs text-gray-500 mt-6">
        More detailed statistics and filtering options coming soon.
      </p>
    </div>
  );
}
