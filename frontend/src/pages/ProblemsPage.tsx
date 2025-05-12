// frontend/src/pages/ProblemsPage.tsx
import React from "react";
import { gql, useQuery } from "@apollo/client";
import { Link } from "react-router-dom"; // For linking to individual problems later
import { Loader2, Tag, Puzzle } from "lucide-react"; // Icons

const LIST_PROBLEMS_QUERY = gql`
  query ListProblems($limit: Int) {
    listProblems(limit: $limit) {
      id
      title
      platform
      # difficulty # Add if available later
      tags
    }
  }
`;

interface ProblemStub {
  id: string;
  title: string;
  platform: string;
  difficulty?: string; // Optional
  tags?: string[]; // Optional
}

interface ListProblemsData {
  listProblems: ProblemStub[];
}

export default function ProblemsPage() {
  const { data, loading, error } = useQuery<ListProblemsData>(
    LIST_PROBLEMS_QUERY,
    {
      variables: { limit: 50 }, // Fetch 50 problems for now
    },
  );

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-100px)] flex flex-col items-center justify-center text-white bg-gray-850 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-sky-400" />
        <p className="mt-4 text-xl">Loading Problems...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-100px)] flex flex-col items-center justify-center text-red-400 bg-gray-850 p-4">
        <Puzzle size={48} className="mb-4" />
        <h2 className="text-2xl font-semibold mb-2">
          Oops! Something went wrong.
        </h2>
        <p className="text-center">{error.message}</p>
        <p className="mt-4 text-sm text-gray-500">
          Please try refreshing the page or check back later.
        </p>
      </div>
    );
  }

  const problems = data?.listProblems || [];

  return (
    <div className="container mx-auto px-4 py-8 text-white">
      <h1 className="text-4xl font-bold mb-8 text-center text-sky-400">
        Problem Set
      </h1>

      {problems.length === 0 && !loading && (
        <div className="text-center text-gray-400 py-10">
          <Puzzle size={48} className="mb-4 mx-auto" />
          <p className="text-xl">No problems found at the moment.</p>
          <p>This might be due to API issues or an empty problem bank.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {problems.map((problem) => (
          <div
            key={`${problem.platform}-${problem.id}`}
            className="bg-gray-800 p-6 rounded-xl shadow-lg hover:shadow-sky-500/30 transition-all duration-300 transform hover:-translate-y-1 flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-xl font-semibold text-green-400 hover:text-green-300 transition-colors">
                  {/* Later, link to a specific problem page: /problems/${problem.platform}/${problem.id} */}
                  {/* For now, just display title, or could link to start a duel with this problem */}
                  <Link
                    to={`/compete/problem-${problem.platform}-${problem.id.replace(/[^a-zA-Z0-9-_]/g, "")}`}
                    title={`Start duel with ${problem.title}`}
                  >
                    {problem.title}
                  </Link>
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium
                    ${problem.platform === "leetcode" ? "bg-yellow-500/20 text-yellow-300" : ""}
                    ${problem.platform === "codeforces" ? "bg-purple-500/20 text-purple-300" : ""}
                  `}
                >
                  {problem.platform.charAt(0).toUpperCase() +
                    problem.platform.slice(1)}
                </span>
              </div>

              {/* Optional: Difficulty (if/when available)
              {problem.difficulty && (
                <p className="text-sm text-gray-400 mb-1">
                  Difficulty: <span className="font-medium text-orange-400">{problem.difficulty}</span>
                </p>
              )} */}

              {problem.tags && problem.tags.length > 0 && (
                <div className="mb-3">
                  <div className="flex flex-wrap gap-2">
                    {problem.tags.slice(0, 3).map(
                      (
                        tag, // Show max 3 tags for brevity
                      ) => (
                        <span
                          key={tag}
                          className="bg-gray-700 text-sky-300 px-2 py-0.5 rounded-md text-xs flex items-center"
                        >
                          <Tag size={12} className="mr-1 opacity-70" /> {tag}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-auto pt-3">
              {" "}
              {/* mt-auto pushes this to the bottom */}
              <Link
                to={`/compete/problem-${problem.platform}-${problem.id.replace(/[^a-zA-Z0-9-_]/g, "")}`}
                className="block w-full text-center bg-sky-600 hover:bg-sky-700 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
              >
                Attempt Problem
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
