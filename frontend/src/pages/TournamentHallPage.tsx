// frontend/src/pages/TournamentHallPage.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { gql, useQuery } from "@apollo/client";
import {
  useTournamentSocket,
  DuelInvitation,
  NewTournamentDuelInfo,
} from "../hooks/useTournamentSocket";
import { useAuth } from "../hooks/useAuth";
import {
  Loader2,
  Users,
  ShieldCheck,
  UserX,
  Play,
  Crown,
  Info,
  Eye,
  AlertTriangle,
} from "lucide-react";

const GET_TOURNAMENT_DETAILS_QUERY = gql`
  query GetTournament($tournamentId: ID!) {
    getTournament(tournamentId: $tournamentId) {
      id
      name
      status
      organizer {
        id
        username
      }
      maxParticipants
      hasVideo
      problemSetType
      curatedProblemIds
      createdAt
      participants {
        # Get initial list of participants
        user {
          id
          username
          rating
        }
        isActive
      }
    }
  }
`;

// Simplified Tournament type for this page based on GQL query
interface TournamentPageData {
  id: string;
  name: string;
  status: string;
  organizer: { id: string; username: string };
  maxParticipants?: number | null;
  hasVideo: boolean;
  problemSetType: string;
  participants: Array<{
    user: { id: string; username: string; rating: number };
    isActive: boolean;
  }>;
}

export default function TournamentHallPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const navigate = useNavigate();
  const { user: authUser, isAuthenticated, isLoadingAuth } = useAuth();

  // Fetch initial static tournament details
  const {
    data: gqlTournamentData,
    loading: gqlLoading,
    error: gqlError,
    refetch: refetchGqlTournament,
  } = useQuery<{ getTournament: TournamentPageData }>(
    GET_TOURNAMENT_DETAILS_QUERY,
    {
      variables: { tournamentId },
      skip: !tournamentId, // Don't run if no tournamentId
      onCompleted: (data) => {
        // Can use this to update initial hallState in useTournamentSocket if needed,
        // but socket's 'hallState' event is primary for dynamic data.
        if (data && data.getTournament) {
          // Update local state if socket hook doesn't provide it first or is slower
          if (
            socketHook.hallState === null ||
            socketHook.hallState.tournamentDetails?.id !== data.getTournament.id
          ) {
            // This is a bit redundant if socket also sends tournamentDetails, pick one source of truth
          }
        }
      },
    },
  );

  // Socket hook for real-time updates
  const socketHook = useTournamentSocket(tournamentId, authUser);
  const {
    isConnected,
    hallState,
    duelInvitations,
    activeTournamentDuels,
    hallError,
    // joinTournamentHall is called by the hook itself
    kickParticipant,
    startNextRound,
    clearLastInvitation,
  } = socketHook;

  const [showKickConfirm, setShowKickConfirm] = useState<string | null>(null); // userId to kick

  // Handle duel invitations
  useEffect(() => {
    if (duelInvitations.length > 0) {
      const latestInvitation = duelInvitations[duelInvitations.length - 1]; // Get the most recent one
      const joinDuel = window.confirm(
        `You've been invited to a duel against ${latestInvitation.opponentUsername}!\nDuel ID: ${latestInvitation.duelId}\n\nJoin now?`,
      );
      if (joinDuel) {
        navigate(`/compete/${latestInvitation.duelId}`);
      }
      clearLastInvitation(); // Clear it after handling
    }
  }, [duelInvitations, navigate, clearLastInvitation]);

  if (isLoadingAuth || (gqlLoading && !hallState)) {
    // Show loading if either GQL or auth is loading initially
    return (
      <div className="text-center p-10 text-white">
        <Loader2 className="h-12 w-12 animate-spin mx-auto text-sky-400" />
        <p className="mt-2">Loading Tournament Hall...</p>
      </div>
    );
  }

  if (!isAuthenticated && !isLoadingAuth) {
    // Check after auth loading is done
    return (
      <div className="text-center p-10 text-red-400">
        Please{" "}
        <Link to="/login" className="underline">
          log in
        </Link>{" "}
        to view the tournament hall.
      </div>
    );
  }

  if (gqlError) {
    return (
      <div className="text-center p-10 text-red-400">
        Error loading tournament details: {gqlError.message}
      </div>
    );
  }
  if (hallError && (!hallState || hallState.tournamentId !== tournamentId)) {
    // Show hallError if critical (e.g., can't join)
    return (
      <div className="text-center p-10 text-red-400">
        Error in tournament hall: {hallError}
      </div>
    );
  }

  const currentTournamentDetails =
    hallState?.tournamentDetails || gqlTournamentData?.getTournament;
  const participants =
    hallState?.participants ||
    gqlTournamentData?.getTournament.participants
      .filter((p) => p.isActive)
      .map((p) => ({ ...p.user, socketId: "" })) ||
    [];
  const isOrganizer =
    authUser &&
    currentTournamentDetails &&
    authUser.id === currentTournamentDetails.organizerId;

  if (!currentTournamentDetails) {
    if (!gqlLoading && !isLoadingAuth) {
      // If done loading and still no details
      return (
        <div className="text-center p-10 text-orange-400">
          Tournament not found or unable to load details. It might be an invalid
          ID or the tournament has ended.
        </div>
      );
    }
    return (
      <div className="text-center p-10 text-white">
        <Loader2 className="h-12 w-12 animate-spin mx-auto text-sky-400" />
        <p className="mt-2">Fetching details...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-2 md:px-4 py-8 text-white">
      <header className="mb-6 p-4 bg-gray-800 rounded-lg shadow-md">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-sky-400 mb-1">
              {currentTournamentDetails.name}
            </h1>
            <p className="text-sm text-gray-400">
              Organized by:{" "}
              {currentTournamentDetails.organizerUsername ||
                currentTournamentDetails.organizer.username}
            </p>
          </div>
          <span
            className={`mt-2 md:mt-0 px-3 py-1.5 text-sm font-semibold rounded-full
                ${currentTournamentDetails.status === "PENDING" ? "bg-yellow-500/80 text-yellow-900" : ""}
                ${currentTournamentDetails.status === "ACTIVE" ? "bg-blue-500/80 text-blue-100" : ""}
                ${currentTournamentDetails.status === "COMPLETED" ? "bg-gray-600/80 text-gray-200" : ""}
            `}
          >
            Status: {currentTournamentDetails.status}
          </span>
        </div>
        <div className="mt-3 text-xs text-gray-500">
          Socket:{" "}
          {isConnected ? (
            <span className="text-green-500">Connected</span>
          ) : (
            <span className="text-red-500">Disconnected</span>
          )}
          {hallError && (
            <span className="ml-2 text-red-400">Error: {hallError}</span>
          )}
        </div>
      </header>

      {isOrganizer && currentTournamentDetails.status === "PENDING" && (
        <div className="mb-6 p-4 bg-green-800/30 border border-green-700 rounded-lg">
          <h3 className="text-xl font-semibold text-green-300 mb-2">
            Organizer Controls
          </h3>
          <button
            onClick={() => startNextRound(currentTournamentDetails.id)}
            disabled={
              participants.length < 2 &&
              currentTournamentDetails.pairingSystem === "RANDOM"
            }
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded shadow-md flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play size={18} className="mr-2" /> Start First Round
          </button>
          {participants.length < 2 &&
            currentTournamentDetails.pairingSystem === "RANDOM" && (
              <p className="text-xs text-yellow-400 mt-1">
                Need at least 2 participants to start with random pairing.
              </p>
            )}
        </div>
      )}
      {isOrganizer &&
        currentTournamentDetails.status ===
          "ACTIVE" /* Assuming one round for now */ && (
          <div className="mb-6 p-4 bg-yellow-800/30 border border-yellow-700 rounded-lg">
            <p className="text-yellow-300">
              <Info size={16} className="inline mr-1" /> Tournament is active.
              Manual round progression or ending tournament to be implemented.
            </p>
          </div>
        )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Participants List */}
        <div className="md:col-span-1 bg-gray-800 p-4 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4 text-gray-100 flex items-center">
            <Users size={24} className="mr-2 text-sky-400" /> Participants (
            {participants.length}
            {currentTournamentDetails.maxParticipants
              ? `/${currentTournamentDetails.maxParticipants}`
              : ""}
            )
          </h2>
          {participants.length === 0 && (
            <p className="text-gray-500">No participants have joined yet.</p>
          )}
          <ul className="space-y-2 max-h-[400px] overflow-y-auto">
            {participants.map((p) => (
              <li
                key={p.userId}
                className="flex justify-between items-center bg-gray-700/50 p-2.5 rounded-md"
              >
                <div className="flex items-center">
                  {p.userId === currentTournamentDetails.organizerId && (
                    <Crown
                      size={16}
                      className="mr-2 text-yellow-400"
                      title="Organizer"
                    />
                  )}
                  <span className="font-medium">{p.username}</span>
                  <span className="text-xs text-gray-400 ml-2">
                    ({p.rating} Elo)
                  </span>
                </div>
                {isOrganizer &&
                  authUser &&
                  p.userId !== authUser.id &&
                  currentTournamentDetails.status === "PENDING" && (
                    <button
                      onClick={() => setShowKickConfirm(p.userId)}
                      className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-500/20"
                    >
                      <UserX size={16} />
                    </button>
                  )}
                {showKickConfirm === p.userId && (
                  <div className="absolute bg-gray-900 p-3 rounded shadow-xl border border-red-500 z-10 right-0 mr-4 -mt-8">
                    <p className="text-sm mb-2">Kick {p.username}?</p>
                    <button
                      onClick={() => {
                        kickParticipant(currentTournamentDetails.id, p.userId);
                        setShowKickConfirm(null);
                      }}
                      className="bg-red-600 px-2 py-1 text-xs rounded mr-1"
                    >
                      Yes, Kick
                    </button>
                    <button
                      onClick={() => setShowKickConfirm(null)}
                      className="bg-gray-600 px-2 py-1 text-xs rounded"
                    >
                      No
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Duels for current round / Tournament Info */}
        <div className="md:col-span-2 bg-gray-800 p-4 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4 text-gray-100">
            Tournament Activity
          </h2>
          {currentTournamentDetails.status === "PENDING" && (
            <p className="text-yellow-400">
              <Info size={16} className="inline mr-1" />
              Waiting for the organizer to start the tournament.
            </p>
          )}
          {activeTournamentDuels.length > 0 && (
            <>
              <h3 className="text-xl font-medium mb-2 text-sky-300">
                Active Duels:
              </h3>
              <ul className="space-y-2">
                {activeTournamentDuels.map((duel) => (
                  <li
                    key={duel.duelId}
                    className="bg-gray-700/50 p-2.5 rounded-md text-sm"
                  >
                    <Link
                      to={`/compete/${duel.duelId}`}
                      className="hover:text-sky-400 flex items-center justify-between"
                    >
                      <span>
                        {duel.p1.username} vs {duel.p2.username}
                      </span>
                      <Eye size={16} className="opacity-70" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {currentTournamentDetails.status === "ACTIVE" &&
            activeTournamentDuels.length === 0 && (
              <p className="text-gray-400">
                No active duels for this round yet, or round is complete.
              </p>
            )}
          {currentTournamentDetails.status === "COMPLETED" && (
            <p className="text-green-400 font-semibold">
              <Trophy size={18} className="inline mr-1" /> Tournament Completed!
            </p>
          )}

          <div className="mt-6 border-t border-gray-700 pt-4">
            <h4 className="text-md font-semibold text-gray-300 mb-1">
              Tournament Settings:
            </h4>
            <p className="text-xs text-gray-400">
              Video Monitoring:{" "}
              {currentTournamentDetails.hasVideo ? "Enabled" : "Disabled"}
            </p>
            <p className="text-xs text-gray-400">
              Problem Set:{" "}
              {currentTournamentDetails.problemSetType.replace(/_/g, " ")}
            </p>
            {currentTournamentDetails.problemSetType === "CURATED" &&
              currentTournamentDetails.curatedProblemIds.length > 0 && (
                <p className="text-xs text-gray-400">
                  Problem IDs:{" "}
                  {currentTournamentDetails.curatedProblemIds.join(", ")}
                </p>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
