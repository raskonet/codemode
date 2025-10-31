import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { gql, useQuery } from "@apollo/client";
import { useTournamentSocket } from "../hooks/useTournamentSocket";
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
  Swords,
  CalendarDays,
  Video as VideoIcon,
  ListChecks,
  Shuffle,
} from "lucide-react";
import toast from "react-hot-toast";

const GET_TOURNAMENT_DETAILS_QUERY = gql`
  query GetTournament($tournamentId: ID!) {
    getTournament(tournamentId: $tournamentId) {
      id
      name
      status
      pairingSystem
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

// Interface for the detailed data fetched via GraphQL
interface TournamentPageData {
  id: string;
  name: string;
  status: string;
  pairingSystem: string;
  organizer: { id: string; username: string };
  maxParticipants: number | null;
  hasVideo: boolean;
  problemSetType: string;
  curatedProblemIds: string[];
  createdAt: string;
  participants: Array<{
    user: { id: string; username: string; rating: number };
    isActive: boolean;
  }>;
}

// A unified participant type that can be derived from either GQL or Socket
interface UnifiedParticipant {
  userId: string;
  username: string;
  rating: number;
  socketId: string;
}

export default function TournamentHallPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const navigate = useNavigate();
  const { user: authUser, isAuthenticated, isLoadingAuth } = useAuth();

  const {
    data: gqlTournamentData,
    loading: gqlLoading,
    error: gqlError,
  } = useQuery<{ getTournament: TournamentPageData }>(
    GET_TOURNAMENT_DETAILS_QUERY,
    { variables: { tournamentId }, skip: !tournamentId },
  );

  const {
    isConnected,
    hallState,
    duelInvitations,
    activeTournamentDuels,
    hallError,
    kickParticipant,
    startNextRound,
    clearLastInvitation,
  } = useTournamentSocket(tournamentId, authUser);

  const [showKickConfirm, setShowKickConfirm] = useState<string | null>(null);

  // Safely get the most up-to-date tournament details
  const currentTournamentDetails = useMemo(() => {
    return hallState?.tournamentDetails || gqlTournamentData?.getTournament;
  }, [hallState, gqlTournamentData]);

  // NORMALIZE ORGANIZER INFO: Create a unified structure for the organizer
  const organizerInfo = useMemo(() => {
    if (!currentTournamentDetails) return null;
    // Case 1: Data is from GQL (`TournamentPageData`)
    if ('organizer' in currentTournamentDetails && currentTournamentDetails.organizer) {
        return currentTournamentDetails.organizer;
    }
    // Case 2: Data is from Socket (`TournamentDetailsBase`)
    if ('organizerId' in currentTournamentDetails) {
        return {
            id: currentTournamentDetails.organizerId,
            username: currentTournamentDetails.organizerUsername || 'Organizer',
        };
    }
    return null;
  }, [currentTournamentDetails]);

  // Create a unified list of participants, prioritizing the live socket data
  const participants: UnifiedParticipant[] = useMemo(() => {
    if (hallState?.participants && hallState.participants.length > 0) {
      return hallState.participants;
    }
    if (gqlTournamentData?.getTournament.participants) {
      return gqlTournamentData.getTournament.participants
        .filter((p) => p.isActive)
        .map((p) => ({
          ...p.user,
          userId: p.user.id,
          socketId: "",
        }));
    }
    return [];
  }, [hallState?.participants, gqlTournamentData]);

  const isOrganizer = useMemo(() => {
    return authUser && organizerInfo && authUser.id === organizerInfo.id;
  }, [authUser, organizerInfo]);


  useEffect(() => {
    if (duelInvitations.length > 0) {
      const latestInvitation = duelInvitations[duelInvitations.length - 1];
      toast(
        (t) => (
          <div className="flex flex-col items-start">
            <strong className="text-sky-300 mb-1">Duel Invitation!</strong>
            <p className="text-sm mb-2">
              You vs{" "}
              <span className="font-semibold">
                {latestInvitation.opponentUsername}
              </span>
              .
            </p>
            <p className="text-xs text-gray-400 mb-3">
              Duel ID: {latestInvitation.duelId}
            </p>
            <div className="w-full flex gap-2">
              <button
                className="btn btn-success btn-sm flex-1"
                onClick={() => {
                  navigate(`/compete/${latestInvitation.duelId}`);
                  toast.dismiss(t.id);
                }}
              >
                Accept
              </button>
              <button
                className="btn btn-secondary btn-sm flex-1"
                onClick={() => toast.dismiss(t.id)}
              >
                Decline
              </button>
            </div>
          </div>
        ),
        {
          duration: 15000,
          icon: <Swords size={20} className="text-sky-400" />,
        },
      );
      clearLastInvitation();
    }
  }, [duelInvitations, navigate, clearLastInvitation]);

  if (isLoadingAuth || (gqlLoading && !hallState)) {
    return (
      <div className="text-center p-10">
        <Loader2 className="h-16 w-16 animate-spin mx-auto text-sky-400" />
        <p className="mt-3 text-lg">Loading Tournament Hall...</p>
      </div>
    );
  }
  if (!isAuthenticated && !isLoadingAuth) {
    return (
      <div className="text-center p-10 text-red-400 text-lg">
        Please{" "}
        <Link to="/login" className="underline font-semibold">
          log in
        </Link>{" "}
        to view the tournament hall.
      </div>
    );
  }

  if (gqlError)
    return (
      <div className="text-center p-10 text-red-400 text-lg">
        Error loading tournament: {gqlError.message}
      </div>
    );
  if (hallError) {
    return (
      <div className="text-center p-10 text-red-400 text-lg">
        Error in tournament hall: {hallError}
      </div>
    );
  }

  if (!currentTournamentDetails) {
      return (
        <div className="text-center p-10">
          <Loader2 className="h-16 w-16 animate-spin mx-auto text-sky-400" />
          <p className="mt-3 text-lg">Fetching details...</p>
        </div>
      );
  }

  const statusColors: Record<string, string> = {
    PENDING: "bg-yellow-500/80 text-yellow-900",
    ACTIVE: "bg-blue-500/80 text-blue-100",
    COMPLETED: "bg-gray-600/80 text-gray-200",
    CANCELLED: "bg-red-600/80 text-red-100",
  };

  return (
    <div className="container mx-auto px-2 md:px-4 py-8">
      <header className="mb-6 p-5 bg-gray-800 rounded-xl shadow-xl border border-gray-700">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-sky-400 mb-1">
              {currentTournamentDetails.name}
            </h1>
            <p className="text-sm text-gray-400">
              Organized by:{" "}
              <span className="font-medium text-gray-300">
                {organizerInfo?.username || '...'}
              </span>
            </p>
          </div>
          <span
            className={`px-3.5 py-1.5 text-sm font-semibold rounded-full ${statusColors[currentTournamentDetails.status] || "bg-gray-500 text-gray-100"}`}
          >
            {currentTournamentDetails.status}
          </span>
        </div>
        <div className="mt-3 text-xs text-gray-500 flex items-center gap-x-3">
          <span>
            Socket:{" "}
            {isConnected ? (
              <span className="text-green-400 font-semibold">Live</span>
            ) : (
              <span className="text-red-400 font-semibold">Offline</span>
            )}
          </span>
          {hallError && (
            <span className="text-red-400">Error: {hallError}</span>
          )}
           { 'createdAt' in currentTournamentDetails && (
            <span className="flex items-center">
                <CalendarDays size={12} className="mr-1" />
                Created:{" "}
                {new Date(currentTournamentDetails.createdAt).toLocaleDateString()}
            </span>
           )}
        </div>
      </header>

      {isOrganizer &&
        (currentTournamentDetails.status === "PENDING" ||
          currentTournamentDetails.status === "ACTIVE") && (
          <div
            className={`mb-6 p-4 rounded-lg border ${currentTournamentDetails.status === "PENDING" ? "bg-green-800/20 border-green-700" : "bg-blue-800/20 border-blue-700"}`}
          >
            <h3 className="text-xl font-semibold mb-3 flex items-center text-gray-100">
              <ShieldCheck size={22} className="mr-2 text-green-400" />
              Organizer Controls
            </h3>
            {currentTournamentDetails.status === "PENDING" && (
              <>
                <button
                  onClick={() => startNextRound(currentTournamentDetails.id)}
                  disabled={
                    participants.length < 2 &&
                    'pairingSystem' in currentTournamentDetails && currentTournamentDetails.pairingSystem === "RANDOM"
                  }
                  className="btn btn-success flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play size={18} className="mr-2" /> Start First Round
                </button>
                {participants.length < 2 && 'pairingSystem' in currentTournamentDetails && currentTournamentDetails.pairingSystem === "RANDOM" && (
                    <p className="text-xs text-yellow-300 mt-1.5">
                      Need at least 2 participants for random pairing.
                    </p>
                  )}
              </>
            )}
            {currentTournamentDetails.status === "ACTIVE" && (
              <p className="text-blue-300 text-sm">
                <Info size={16} className="inline mr-1.5" /> Tournament is
                active.
              </p>
            )}
          </div>
        )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 card bg-gray-800 p-5 rounded-xl shadow-lg border border-gray-700">
          <h2 className="text-2xl font-semibold mb-4 text-gray-100 flex items-center">
            <Users size={24} className="mr-2.5 text-sky-400" /> Participants (
            {participants.length}
            {currentTournamentDetails.maxParticipants
              ? `/${currentTournamentDetails.maxParticipants}`
              : ""}
            )
          </h2>
          {participants.length === 0 ? (
            <p className="text-gray-500 italic">
              No participants yet. Waiting for duelists...
            </p>
          ) : (
            <ul className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
              {participants.map((p) => (
                <li
                  key={p.userId}
                  className="flex justify-between items-center bg-gray-700/60 p-3 rounded-lg shadow-sm hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center">
                    {p.userId === organizerInfo?.id && (
                      <Crown
                        size={16}
                        className="mr-2 text-yellow-400"
                      />
                    )}
                    <span className="font-medium text-gray-200">
                      {p.username}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      ({p.rating} Elo)
                    </span>
                  </div>
                  {isOrganizer && authUser && p.userId !== authUser.id && (
                      <button
                        onClick={() => setShowKickConfirm(p.userId)}
                        className="text-red-500 hover:text-red-400 p-1 rounded-full hover:bg-red-500/10 transition-colors"
                        title={`Kick ${p.username}`}
                      >
                        <UserX size={18} />
                      </button>
                    )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {showKickConfirm && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl border border-red-600 max-w-sm w-full">
              <h3 className="text-lg font-semibold mb-4 text-red-300">
                Confirm Kick
              </h3>
              <p className="mb-6 text-gray-300">
                Are you sure you want to kick participant{" "}
                <span className="font-bold">
                  {
                    participants.find((par) => par.userId === showKickConfirm)
                      ?.username
                  }
                </span>
                ?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowKickConfirm(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (showKickConfirm) {
                        kickParticipant(
                            currentTournamentDetails.id,
                            showKickConfirm,
                        );
                        setShowKickConfirm(null);
                        toast.success("Participant kicked.");
                    }
                  }}
                  className="btn btn-danger"
                >
                  Yes, Kick
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="lg:col-span-2 card bg-gray-800 p-5 rounded-xl shadow-lg border border-gray-700">
          <h2 className="text-2xl font-semibold mb-4 text-gray-100">
            Tournament Activity
          </h2>
          {currentTournamentDetails.status === "PENDING" && (
            <p className="text-yellow-300 text-sm">
              <Info size={16} className="inline mr-1.5" />
              Waiting for the organizer to start the tournament. Get ready!
            </p>
          )}

          {activeTournamentDuels.length > 0 && (
            <>
              <h3 className="text-xl font-medium mb-3 text-sky-300">
                Active Duels:
              </h3>
              <ul className="space-y-2.5">
                {activeTournamentDuels.map((duel) => (
                  <li
                    key={duel.duelId}
                    className="bg-gray-700/60 p-3 rounded-lg text-sm shadow-sm hover:bg-gray-700 transition-colors"
                  >
                    <Link
                      to={`/compete/${duel.duelId}`}
                      className="hover:text-sky-300 flex items-center justify-between text-gray-200"
                    >
                      <span>
                        <span className="font-semibold">
                          {duel.p1.username}
                        </span>{" "}
                        vs{" "}
                        <span className="font-semibold">
                          {duel.p2.username}
                        </span>
                      </span>
                      <Eye size={18} className="opacity-80" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {currentTournamentDetails.status === "ACTIVE" &&
            activeTournamentDuels.length === 0 && (
              <p className="text-gray-400 italic">
                No active duels for this round, or round is complete.
              </p>
            )}
          {currentTournamentDetails.status === "COMPLETED" && (
            <p className="text-green-400 font-semibold text-lg">
              <Crown size={20} className="inline mr-1.5" /> Tournament
              Completed!
            </p>
          )}

          <div className="mt-6 border-t border-gray-700 pt-5">
            <h4 className="text-md font-semibold text-gray-300 mb-2">
              Tournament Info:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
              <p className="flex items-center">
                <VideoIcon size={14} className="mr-1.5 text-sky-400" />
                Video:{" "}
                {currentTournamentDetails.hasVideo ? "Enabled" : "Disabled"}
              </p>
              <p className="flex items-center">
                {currentTournamentDetails.problemSetType === "CURATED" ? (
                  <ListChecks size={14} className="mr-1.5 text-sky-400" />
                ) : (
                  <Shuffle size={14} className="mr-1.5 text-sky-400" />
                )}
                Problems:{" "}
                {currentTournamentDetails.problemSetType.replace(/_/g, " ")}
              </p>
              {currentTournamentDetails.problemSetType === "CURATED" &&
                'curatedProblemIds' in currentTournamentDetails && currentTournamentDetails.curatedProblemIds.length > 0 && (
                  <p className="sm:col-span-2">
                    IDs:{" "}
                    <span className="text-gray-300">
                      {currentTournamentDetails.curatedProblemIds.join(", ")}
                    </span>
                  </p>
                )}
              { 'pairingSystem' in currentTournamentDetails && (
                <p className="flex items-center">
                    <Users size={14} className="mr-1.5 text-sky-400" />
                    Pairing: {currentTournamentDetails.pairingSystem}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
