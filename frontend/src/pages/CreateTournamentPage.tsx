// frontend/src/pages/CreateTournamentPage.tsx
import React, { useState } from "react";
import { gql, useMutation } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Loader2 } from "lucide-react";

const CREATE_TOURNAMENT_MUTATION = gql`
  mutation CreateTournament(
    $name: String!
    $maxParticipants: Int
    $hasVideo: Boolean
    $problemSetType: String # Ensure this matches your GQL enum or String type
    $curatedProblemIds: [String!]
  ) {
    createTournament(
      name: $name
      maxParticipants: $maxParticipants
      hasVideo: $hasVideo
      problemSetType: $problemSetType
      curatedProblemIds: $curatedProblemIds
    ) {
      id
      name
      status
    }
  }
`;

// Assuming problemSetType can be "RANDOM_LEETCODE", "RANDOM_CODEFORCES", "CURATED"
type ProblemSetType = "RANDOM_LEETCODE" | "RANDOM_CODEFORCES" | "CURATED";

export default function CreateTournamentPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [name, setName] = useState("");
  const [maxParticipants, setMaxParticipants] = useState<number | undefined>(
    16,
  );
  const [hasVideo, setHasVideo] = useState(false);
  const [problemSetType, setProblemSetType] =
    useState<ProblemSetType>("RANDOM_LEETCODE");
  const [curatedProblemIds, setCuratedProblemIds] = useState(""); // Comma-separated string

  const [createTournament, { loading: creatingTournament, error }] =
    useMutation(CREATE_TOURNAMENT_MUTATION, {
      onCompleted: (data) => {
        if (data.createTournament) {
          console.log("Tournament created:", data.createTournament);
          navigate(`/hall/${data.createTournament.id}`); // Navigate to the new tournament hall
        }
      },
      onError: (err) => {
        console.error("Error creating tournament:", err);
        // Error state is handled by the `error` variable from useMutation
      },
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("Tournament name is required.");
      return;
    }
    let problemIdsArray: string[] | undefined;
    if (problemSetType === "CURATED") {
      if (!curatedProblemIds.trim()) {
        alert("Please provide comma-separated problem IDs for a curated set.");
        return;
      }
      problemIdsArray = curatedProblemIds
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id);
      if (problemIdsArray.length === 0) {
        alert("Curated problem set requires at least one valid problem ID.");
        return;
      }
    }

    createTournament({
      variables: {
        name,
        maxParticipants: maxParticipants ? Number(maxParticipants) : null,
        hasVideo,
        problemSetType,
        curatedProblemIds:
          problemSetType === "CURATED" ? problemIdsArray : null,
      },
    });
  };

  if (isLoadingAuth) {
    return (
      <div className="text-center p-10 text-white">
        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return (
      <div className="text-center p-10 text-red-400">
        Please log in to create a tournament.
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 text-white max-w-2xl">
      <h1 className="text-4xl font-bold mb-8 text-center text-sky-400">
        Create New Tournament
      </h1>
      <form
        onSubmit={handleSubmit}
        className="space-y-6 bg-gray-800 p-6 md:p-8 rounded-xl shadow-xl"
      >
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            Tournament Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div>
          <label
            htmlFor="maxParticipants"
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            Max Participants (optional)
          </label>
          <input
            type="number"
            id="maxParticipants"
            value={maxParticipants || ""}
            onChange={(e) =>
              setMaxParticipants(
                e.target.value ? parseInt(e.target.value, 10) : undefined,
              )
            }
            min="2"
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            id="hasVideo"
            checked={hasVideo}
            onChange={(e) => setHasVideo(e.target.checked)}
            className="h-4 w-4 text-sky-500 bg-gray-700 border-gray-600 rounded focus:ring-sky-500"
          />
          <label htmlFor="hasVideo" className="ml-2 text-sm text-gray-300">
            Enable Video Monitoring (feature not fully implemented)
          </label>
        </div>
        <div>
          <label
            htmlFor="problemSetType"
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            Problem Set Type
          </label>
          <select
            id="problemSetType"
            value={problemSetType}
            onChange={(e) =>
              setProblemSetType(e.target.value as ProblemSetType)
            }
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="RANDOM_LEETCODE">Random LeetCode</option>
            <option value="RANDOM_CODEFORCES">Random Codeforces</option>
            <option value="CURATED">Curated (Provide IDs)</option>
          </select>
        </div>
        {problemSetType === "CURATED" && (
          <div>
            <label
              htmlFor="curatedProblemIds"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Curated Problem IDs (comma-separated LeetCode slugs)
            </label>
            <input
              type="text"
              id="curatedProblemIds"
              value={curatedProblemIds}
              onChange={(e) => setCuratedProblemIds(e.target.value)}
              placeholder="e.g., two-sum,reverse-string"
              className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        )}
        {error && (
          <p className="text-red-400 bg-red-900/30 p-3 rounded text-sm">
            Error:{" "}
            {error.graphQLErrors.map(({ message }, i) => message).join(", ") ||
              error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={creatingTournament}
          className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {creatingTournament && (
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
          )}
          {creatingTournament ? "Creating..." : "Create Tournament"}
        </button>
      </form>
    </div>
  );
}
