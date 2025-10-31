import { useEffect, useState, useRef, useCallback } from "react";
import io, { Socket } from "socket.io-client";
import {type User as AuthUser } from "../contexts/AuthContext"; // Assuming User type from AuthContext

const SOCKET_SERVER_URL = import.meta.env.DEV ? "http://localhost:4000" : "YOUR_PRODUCTION_BACKEND_URL";


// Types for Tournament Hall (should align with backend)
export interface HallParticipant {
  socketId: string;
  userId: string;
  username: string;
  rating: number;
}

export interface TournamentDetailsBase {
  // Base details, GQL might provide more
  id: string;
  name: string;
  organizerId: string; // ID of the organizer
  organizerUsername?: string; // Username of organizer
  status: string; // PENDING, ACTIVE, COMPLETED, CANCELLED
  maxParticipants?: number | null;
  hasVideo: boolean;
  problemSetType: string;
  curatedProblemIds: string[];
  // Add other fields as needed by the UI
}

export interface TournamentHallState {
  tournamentId: string;
  organizerId: string;
  participants: HallParticipant[];
  tournamentDetails?: TournamentDetailsBase | null; // Static details from GQL or initial socket event
}

export interface DuelInvitation {
  duelId: string;
  opponentUsername: string;
  problemSetType: string; // To give context if needed
  curatedProblemIds?: string[];
}

export interface NewTournamentDuelInfo {
  duelId: string;
  p1: { userId: string; username: string };
  p2: { userId: string; username: string };
}

interface UseTournamentSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  hallState: TournamentHallState | null;
  duelInvitations: DuelInvitation[]; // Array of invitations for the current user
  activeTournamentDuels: NewTournamentDuelInfo[]; // List of duels for the current round
  hallError: string | null;
  joinTournamentHall: (tournamentId: string) => void; // Explicit join
  kickParticipant: (tournamentId: string, targetUserId: string) => void;
  startNextRound: (tournamentId: string) => void;
  clearLastInvitation: () => void; // To clear an invitation after handling
}

export const useTournamentSocket = (
  tournamentIdToJoin?: string,
  authUser?: AuthUser | null,
): UseTournamentSocketReturn => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [hallState, setHallState] = useState<TournamentHallState | null>(null);
  const [duelInvitations, setDuelInvitations] = useState<DuelInvitation[]>([]);
  const [activeTournamentDuels, setActiveTournamentDuels] = useState<
    NewTournamentDuelInfo[]
  >([]);
  const [hallError, setHallError] = useState<string | null>(null);

  const clearLastInvitation = useCallback(() => {
    setDuelInvitations((prev) => prev.slice(0, -1)); // Removes the most recent invitation
  }, []);

  useEffect(() => {
    if (tournamentIdToJoin && authUser && !socketRef.current) {
      // Connect only if tournamentId and authUser are present
      console.log(
        `TournamentSocket: Attempting to connect for tournament ${tournamentIdToJoin} as ${authUser.username}`,
      );
      // Pass auth token in handshake for socket authentication by backend
      const newSocket = io(SOCKET_SERVER_URL, {
        // auth: { token: localStorage.getItem('your_jwt_token_key') } // If using token-based socket auth
        // For cookie-based, ensure 'withCredentials' is true on client if needed,
        // and server's CORS is set up for credentials. Socket.IO client sends cookies by default.
        withCredentials: true,
      });
      socketRef.current = newSocket;

      newSocket.on("connect", () => {
        console.log("TournamentSocket: Connected", newSocket.id);
        setIsConnected(true);
        setHallError(null);
        // Automatically join the hall once connected and authenticated by backend middleware
        joinTournamentHall(tournamentIdToJoin);
      });

      newSocket.on("disconnect", (reason) => {
        console.log("TournamentSocket: Disconnected", reason);
        setIsConnected(false);
        setHallError(
          reason === "io server disconnect"
            ? "Disconnected by server"
            : "Connection lost",
        );
      });

      newSocket.on("hallState", (data: TournamentHallState) => {
        console.log("TournamentSocket: Received hall state", data);
        setHallState(data);
      });

      newSocket.on("userJoinedHall", (participant: HallParticipant) => {
        console.log("TournamentSocket: User joined hall", participant);
        setHallState((prev) => {
          if (!prev) return prev;
          const existing = prev.participants.find(
            (p) => p.userId === participant.userId,
          );
          if (existing) {
            // Update if user reconnected with new socketId or info
            return {
              ...prev,
              participants: prev.participants.map((p) =>
                p.userId === participant.userId ? participant : p,
              ),
            };
          }
          return { ...prev, participants: [...prev.participants, participant] };
        });
      });

      newSocket.on(
        "userLeftHall",
        (data: { userId: string; username: string }) => {
          console.log("TournamentSocket: User left hall", data);
          setHallState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              participants: prev.participants.filter(
                (p) => p.userId !== data.userId,
              ),
            };
          });
        },
      );

      newSocket.on(
        "tournamentStatusUpdate",
        (data: { status: string /* TournamentStatus */ }) => {
          console.log("TournamentSocket: Status update", data);
          setHallState((prev) =>
            prev
              ? {
                  ...prev,
                  tournamentDetails: {
                    ...prev.tournamentDetails!,
                    status: data.status,
                  },
                }
              : null,
          );
        },
      );

      newSocket.on("newTournamentDuel", (duelInfo: NewTournamentDuelInfo) => {
        console.log("TournamentSocket: New duel created", duelInfo);
        setActiveTournamentDuels((prev) => [...prev, duelInfo]);
        // Optionally clear old duels if a new round starts entirely
      });

      newSocket.on("duelInvitation", (invitation: DuelInvitation) => {
        console.log("TournamentSocket: Received duel invitation", invitation);
        setDuelInvitations((prev) => [...prev, invitation]);
        // The UI component will handle navigating to the duel
      });

      newSocket.on(
        "kickedFromHall",
        (data: { tournamentId: string; reason: string }) => {
          console.log("TournamentSocket: Kicked from hall", data);
          setHallError(`You were kicked from the tournament: ${data.reason}`);
          // Potentially navigate away or disable functionality
          socketRef.current?.disconnect(); // Disconnect after being kicked
        },
      );

      newSocket.on("hallError", (data: { message: string }) => {
        console.error(
          "TournamentSocket: Hall Error from server:",
          data.message,
        );
        setHallError(data.message);
      });

      newSocket.on("connect_error", (err) => {
        console.error("TournamentSocket: Connection error:", err.message);
        setHallError(`Connection failed: ${err.message}`);
        setIsConnected(false);
      });
    }

    return () => {
      if (socketRef.current) {
        console.log("TournamentSocket: Cleaning up socket connection.");
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [tournamentIdToJoin, authUser]); // Re-establish connection if tournamentId or authUser changes

  const joinTournamentHall = useCallback(
    (currentTournamentId: string) => {
      if (socketRef.current?.connected && authUser) {
        // Ensure authUser is present for join
        console.log(
          `TournamentSocket: Emitting joinHall for ${currentTournamentId} as ${authUser.username}`,
        );
        // Backend's io.use auth middleware will use the cookie to identify the user.
        // No need to send userId/username here if socket is authenticated.
        socketRef.current.emit(
          "joinHall",
          { tournamentId: currentTournamentId },
          (response: {
            success: boolean;
            error?: string;
            tournamentDetails?: TournamentDetailsBase;
          }) => {
            if (response.success) {
              console.log(
                "Successfully joined hall, initial details:",
                response.tournamentDetails,
              );
              if (response.tournamentDetails) {
                setHallState((prev) => ({
                  ...(prev || {
                    tournamentId: currentTournamentId,
                    organizerId: "",
                    participants: [],
                  }), // sensible defaults
                  tournamentDetails: response.tournamentDetails,
                  organizerId: response.tournamentDetails?.organizerId || "", // ensure organizerId is set in hallState
                }));
              }
            } else {
              console.error("Failed to join hall:", response.error);
              setHallError(response.error || "Failed to join tournament hall.");
            }
          },
        );
      } else {
        console.warn(
          "TournamentSocket: Cannot join hall - socket not connected or user not authenticated.",
        );
      }
    },
    [authUser],
  );

  const kickParticipant = useCallback(
    (currentTournamentId: string, targetUserId: string) => {
      socketRef.current?.emit("kickFromHall", {
        tournamentId: currentTournamentId,
        targetUserId,
      });
    },
    [],
  );

  const startNextRound = useCallback((currentTournamentId: string) => {
    setActiveTournamentDuels([]); // Clear duels from previous round
    socketRef.current?.emit("startTournamentRound", {
      tournamentId: currentTournamentId,
    });
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    hallState,
    duelInvitations,
    activeTournamentDuels,
    hallError,
    joinTournamentHall,
    kickParticipant,
    startNextRound,
    clearLastInvitation,
  };
};
