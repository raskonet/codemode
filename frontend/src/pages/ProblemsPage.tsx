import { gql, useQuery } from "@apollo/client";
import { Link } from "react-router-dom";
import {
  Loader2,
  Tag,
  Puzzle,
  AlertTriangle,
  Code,
  ExternalLink,
} from "lucide-react";

const LIST_PROBLEMS_QUERY = gql`
  query ListProblems($limit: Int) {
    listProblems(limit: $limit) {
      id
      title
      platform
      tags
    }
  }
`;

interface ProblemStub {
  id: string;
  title: string;
  platform: string;
  tags?: string[];
}

interface ListProblemsData {
  listProblems: ProblemStub[];
}

const platformColors: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  leetcode: {
    bg: "bg-yellow-500/10",
    text: "text-yellow-300",
    border: "border-yellow-500/30",
  },
  codeforces: {
    bg: "bg-purple-500/10",
    text: "text-purple-300",
    border: "border-purple-500/30",
  },
  internal: {
    bg: "bg-sky-500/10",
    text: "text-sky-300",
    border: "border-sky-500/30",
  },
};

export default function ProblemsPage() {
  const { data, loading, error } = useQuery<ListProblemsData>(
    LIST_PROBLEMS_QUERY,
    { variables: { limit: 50 } },
  );

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-120px)] flex flex-col items-center justify-center p-4">
        <Loader2 className="h-16 w-16 animate-spin text-sky-400" />
        <p className="mt-6 text-xl text-gray-300">Loading Problems...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-120px)] flex flex-col items-center justify-center text-center p-4">
        <AlertTriangle size={60} className="mb-6 text-red-400" />
        <h2 className="text-3xl font-semibold mb-3 text-red-300">
          Oops! Something went wrong.
        </h2>
        <p className="text-gray-400 max-w-md">{error.message}</p>
        <p className="mt-6 text-sm text-gray-500">
          Please try refreshing the page or check back later.
        </p>
      </div>
    );
  }

  const problems = data?.listProblems || [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-center mb-10">
        <Puzzle size={36} className="mr-3 text-sky-400" />
        <h1 className="text-4xl font-bold text-gray-100">Problem Set</h1>
      </div>

      {problems.length === 0 && !loading && (
        <div className="text-center text-gray-400 py-16">
          <Code size={64} className="mb-6 mx-auto opacity-30" />
          <p className="text-2xl mb-2">No problems found.</p>
          <p className="text-gray-500">
            This might be due to API issues or an empty problem bank. Check back
            soon!
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
        {problems.map((problem) => {
          const platformStyle =
            platformColors[problem.platform.toLowerCase()] ||
            platformColors.internal;
          const duelLink = `/compete/problem-${problem.platform}-${problem.id.replace(/[^a-zA-Z0-9-_]/g, "")}`;

          let externalLink = "";
          if (problem.platform.toLowerCase() === "leetcode") {
            externalLink = `https://leetcode.com/problems/${problem.id}/`;
          } else if (problem.platform.toLowerCase() === "codeforces") {
            // CF problem IDs are usually ContestID + Index, e.g., 123A
            // This is a guess, might need adjustment based on actual `problem.id` format from backend
            const match = problem.id.match(/(\d+)([A-Z]\d*)/);
            if (match) {
              externalLink = `https://codeforces.com/problemset/problem/${match[1]}/${match[2]}`;
            }
          }

          return (
            <div
              key={`${problem.platform}-${problem.id}`}
              className={`card card-hover flex flex-col justify-between border ${platformStyle.border} shadow-lg hover:shadow-md ${platformStyle.bg}`}
            >
              <div>
                <div className="flex justify-between items-start mb-2.5">
                  <h2 className="text-xl font-semibold text-gray-100 hover:text-sky-300 transition-colors">
                    <Link to={duelLink} title={`Attempt ${problem.title}`}>
                      {problem.title}
                    </Link>
                  </h2>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${platformStyle.text} ${platformStyle.bg.replace("/10", "/30")} border ${platformStyle.border}`}
                  >
                    {problem.platform.charAt(0).toUpperCase() +
                      problem.platform.slice(1)}
                  </span>
                </div>

                {problem.tags && problem.tags.length > 0 && (
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-1.5">
                      {problem.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="bg-gray-700 text-sky-300 px-2 py-0.5 rounded-md text-xs flex items-center"
                        >
                          <Tag size={12} className="mr-1 opacity-70" /> {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-auto pt-3 space-y-2">
                <Link
                  to={duelLink}
                  className="btn btn-primary w-full text-sm flex items-center justify-center"
                >
                  <Puzzle size={16} className="mr-2" /> Attempt Problem
                </Link>
                {externalLink && (
                  <a
                    href={externalLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary w-full text-sm flex items-center justify-center !bg-gray-700 hover:!bg-gray-600"
                  >
                    <ExternalLink size={16} className="mr-2" /> View on{" "}
                    {problem.platform}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
