import React, { useState } from "react";
import { gql, useMutation } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Loader2, PlusCircle, Video, ListChecks, Shuffle } from "lucide-react";
import toast from "react-hot-toast";

const CREATE_TOURNAMENT_MUTATION = gql`
  mutation CreateTournament(
    $name: String!
    $maxParticipants: Int
    $hasVideo: Boolean
    $problemSetType: String
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
  const [curatedProblemIds, setCuratedProblemIds] = useState("");

  const [createTournament, { loading: creatingTournament, error }] =
    useMutation(CREATE_TOURNAMENT_MUTATION, {
      onCompleted: (data) => {
        if (data.createTournament) {
          toast.success(`Tournament "${data.createTournament.name}" created!`);
          navigate(`/hall/${data.createTournament.id}`);
        }
      },
      onError: (err) => {
        toast.error(
          err.graphQLErrors?.[0]?.message ||
            err.message ||
            "Failed to create tournament.",
        );
      },
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Tournament name is required.");
      return;
    }
    let problemIdsArray: string[] | undefined;
    if (problemSetType === "CURATED") {
      if (!curatedProblemIds.trim()) {
        toast.error(
          "Please provide comma-separated problem IDs for a curated set.",
        );
        return;
      }
      problemIdsArray = curatedProblemIds
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id);
      if (problemIdsArray.length === 0) {
        toast.error(
          "Curated problem set requires at least one valid problem ID.",
        );
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
      <div className="text-center p-10">
        <Loader2 className="h-12 w-12 animate-spin mx-auto text-sky-400" />
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
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-4xl font-bold mb-10 text-center text-sky-400 flex items-center justify-center">
        <PlusCircle size={36} className="mr-3" /> Create New Tournament
      </h1>
      <form
        onSubmit={handleSubmit}
        className="space-y-6 card bg-gray-800 p-6 md:p-8 rounded-xl shadow-2xl"
      >
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-300 mb-1.5"
          >
            Tournament Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div>
          <label
            htmlFor="maxParticipants"
            className="block text-sm font-medium text-gray-300 mb-1.5"
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
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div className="flex items-center space-x-3 p-3 bg-gray-700/50 rounded-lg">
          <input
            type="checkbox"
            id="hasVideo"
            checked={hasVideo}
            onChange={(e) => setHasVideo(e.target.checked)}
            className="h-5 w-5 text-sky-500 bg-gray-700 border-gray-600 rounded focus:ring-sky-500 cursor-pointer"
          />
          <label
            htmlFor="hasVideo"
            className="text-sm text-gray-300 flex items-center cursor-pointer"
          >
            <Video size={18} className="mr-2 text-sky-400" /> Enable Video
            (feature in progress)
          </label>
        </div>
        <div>
          <label
            htmlFor="problemSetType"
            className="block text-sm font-medium text-gray-300 mb-1.5"
          >
            Problem Set Type
          </label>
          <div className="relative">
            <select
              id="problemSetType"
              value={problemSetType}
              onChange={(e) =>
                setProblemSetType(e.target.value as ProblemSetType)
              }
              className="w-full appearance-none px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 pr-8"
            >
              <option value="RANDOM_LEETCODE">Random LeetCode</option>
              <option value="RANDOM_CODEFORCES">Random Codeforces</option>
              <option value="CURATED">Curated (Provide IDs)</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
              {problemSetType === "CURATED" ? (
                <ListChecks size={20} />
              ) : (
                <Shuffle size={20} />
              )}
            </div>
          </div>
        </div>
        {problemSetType === "CURATED" && (
          <div>
            <label
              htmlFor="curatedProblemIds"
              className="block text-sm font-medium text-gray-300 mb-1.5"
            >
              Curated Problem IDs (LeetCode slugs, comma-separated)
            </label>
            <input
              type="text"
              id="curatedProblemIds"
              value={curatedProblemIds}
              onChange={(e) => setCuratedProblemIds(e.target.value)}
              placeholder="e.g., two-sum, reverse-linked-list"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        )}
        {error && (
          <p className="text-red-400 bg-red-900/30 p-3.5 rounded-md text-sm border border-red-700">
            Error:{" "}
            {error.graphQLErrors.map(({ message }) => message).join(", ") ||
              error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={creatingTournament}
          className="w-full btn btn-success text-lg flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {creatingTournament && (
            <Loader2 className="h-6 w-6 animate-spin mr-2.5" />
          )}
          {creatingTournament ? "Creating..." : "Create Tournament"}
        </button>
      </form>
    </div>
  );
}
