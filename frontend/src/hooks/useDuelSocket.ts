// frontend/src/hooks/useDuelSocket.ts
import { useEffect, useState, useRef, useCallback } from "react";
import io, { Socket } from "socket.io-client";
import { User as AuthUser } from "../contexts/AuthContext"; // From AuthContext

const SOCKET_SERVER_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:4000"
    : "YOUR_PRODUCTION_BACKEND_URL";

export type CompetitorRole = "competitor1" | "competitor2";
export type UserRole = CompetitorRole | "spectator";

export interface DuelUser {
  userId: string;
  username: string;
  role: UserRole;
}

export interface CompetitorState {
  userId: string;
  username: string;
  role: CompetitorRole;
  code: string;
  language: string;
  solvedProblem?: boolean;
  submissionTime?: number;
}

export interface Problem {
  id: string;
  title: string;
  description: string;
  tests: Array<{ stdin: string; expected: string }>;
  platform: string;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
  metaData?: string;
}

export interface DuelRoomState {
  competitors: CompetitorState[];
  problem?: Problem | null;
  status?: "waiting" | "active" | "finished";
  startTime?: number;
  winner?: string | null;
  forfeitedBy?: string | null; // Added for forfeit info
}

interface RatingsUpdatePayload {
  [userId: string]: {
    oldRating: number;
    newRating: number;
  };
}

interface UseDuelSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  joinDuelRoom: (
    duelId: string,
    user: AuthUser | null,
    initialCode?: string,
    initialLanguage?: string,
  ) => void; // User can be null for anonymous spectator
  sendCodeUpdate: (
    duelId: string,
    user: AuthUser,
    code: string,
    role: CompetitorRole,
  ) => void;
  sendLanguageUpdate: (
    duelId: string,
    user: AuthUser,
    language: string,
    role: CompetitorRole,
  ) => void;
  sendProblemSolved: (
    duelId: string,
    user: AuthUser,
    role: CompetitorRole,
    submissionTime: number,
  ) => void;
  assignedRoleAndUser: DuelUser | null;
  duelRoomState: DuelRoomState | null;
  usersInRoom: DuelUser[];
  duelError: string | null; // Errors specific to duel socket
  ratingsUpdate: RatingsUpdatePayload | null; // For ELO updates
}

export const useDuelSocket = (duelIdToJoin?: string): UseDuelSocketReturn => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [assignedRoleAndUser, setAssignedRoleAndUser] =
    useState<DuelUser | null>(null);
  const [usersInRoom, setUsersInRoom] = useState<DuelUser[]>([]);
  const [duelRoomState, setDuelRoomState] = useState<DuelRoomState | null>(
    null,
  );
  const [duelError, setDuelError] = useState<string | null>(null);
  const [ratingsUpdate, setRatingsUpdate] =
    useState<RatingsUpdatePayload | null>(null);

  useEffect(() => {
    if (duelIdToJoin && !socketRef.current) {
      console.log(`DuelSocket: Initializing socket for duel: ${duelIdToJoin}`);
      const newSocket = io(SOCKET_SERVER_URL, {
        withCredentials: true, // Crucial for sending cookies with socket handshake
      });
      socketRef.current = newSocket;

      newSocket.on("connect", () => {
        console.log("DuelSocket: Connected - ID:", newSocket.id);
        setIsConnected(true);
        setDuelError(null);
        // The CompetePage will call joinDuelRoom when it has authUser details
      });

      newSocket.on("disconnect", (reason) => {
        console.log("DuelSocket: Disconnected:", reason);
        setIsConnected(false);
        if (reason === "io server disconnect")
          setDuelError("Disconnected by server.");
        else setDuelError("Connection lost.");
        // Reset state on disconnect
        setAssignedRoleAndUser(null);
        setUsersInRoom([]);
        setDuelRoomState(null); // Or keep last state for UI continuity on reconnect? For now, clear.
        setRatingsUpdate(null);
      });
      newSocket.on("assignedRole", (data: DuelUser & { duelId: string }) => {
        console.log("DuelSocket: Role assigned:", data);
        setAssignedRoleAndUser(data);
        setUsersInRoom((prev) => {
          const existing = prev.find((u) => u.userId === data.userId);
          if (existing)
            return prev.map((u) =>
              u.userId === data.userId ? { ...data, role: data.role } : u,
            );
          return [...prev, data];
        });
      });
      newSocket.on(
        "duelState",
        (data: DuelRoomState & { competitors: CompetitorState[] }) => {
          console.log("DuelSocket: Received duel state:", data);
          setDuelRoomState(data);
          const currentUsers = data.competitors.map((c) => ({
            userId: c.userId,
            username: c.username,
            role: c.role as UserRole,
          }));
          // Also include self if assigned a role but not yet in competitors list (e.g. spectator initial state)
          if (
            assignedRoleAndUser &&
            !currentUsers.find((u) => u.userId === assignedRoleAndUser.userId)
          ) {
            currentUsers.push(assignedRoleAndUser);
          }
          setUsersInRoom((prev) => {
            const userMap = new Map(prev.map((u) => [u.userId, u]));
            currentUsers.forEach((u) => userMap.set(u.userId, u));
            return Array.from(userMap.values());
          });
        },
      );
      newSocket.on("userJoined", (data: DuelUser) => {
        console.log("DuelSocket: User joined:", data);
        setUsersInRoom((prev) => {
          const existing = prev.find((u) => u.userId === data.userId);
          if (existing)
            return prev.map((u) => (u.userId === data.userId ? data : u));
          return [...prev, data];
        });
      });
      newSocket.on("userLeft", (data: DuelUser) => {
        console.log("DuelSocket: User left:", data);
        setUsersInRoom((prev) => prev.filter((u) => u.userId !== data.userId));
        setDuelRoomState((prev) =>
          prev
            ? {
                ...prev,
                competitors: prev.competitors.filter(
                  (c) => c.userId !== data.userId,
                ),
              }
            : null,
        );
      });
      newSocket.on(
        "competitorCodeUpdated",
        (data: { userId: string; role: CompetitorRole; code: string }) => {
          setDuelRoomState((prev) => {
            if (!prev)
              return {
                competitors: [
                  { ...data, username: "Unknown", language: "cpp" },
                ],
              };
            const newComps = prev.competitors.map((c) =>
              c.userId === data.userId && c.role === data.role
                ? { ...c, code: data.code }
                : c,
            );
            if (
              !newComps.find(
                (c) => c.userId === data.userId && c.role === data.role,
              )
            ) {
              const missingUser = usersInRoom.find(
                (u) => u.userId === data.userId,
              );
              newComps.push({
                ...data,
                username: missingUser?.username || "Unknown",
                language: "cpp",
              });
            }
            return { ...prev, competitors: newComps };
          });
        },
      );
      newSocket.on(
        "competitorLanguageUpdated",
        (data: { userId: string; role: CompetitorRole; language: string }) => {
          setDuelRoomState((prev) => {
            if (!prev)
              return {
                competitors: [{ ...data, username: "Unknown", code: "" }],
              };
            const newComps = prev.competitors.map((c) =>
              c.userId === data.userId && c.role === data.role
                ? { ...c, language: data.language }
                : c,
            );
            if (
              !newComps.find(
                (c) => c.userId === data.userId && c.role === data.role,
              )
            ) {
              const missingUser = usersInRoom.find(
                (u) => u.userId === data.userId,
              );
              newComps.push({
                ...data,
                username: missingUser?.username || "Unknown",
                code: "",
              });
            }
            return { ...prev, competitors: newComps };
          });
        },
      );
      newSocket.on("duelProblemAssigned", (data: { problem: Problem }) => {
        console.log("DuelSocket: Duel problem assigned:", data.problem.title);
        setDuelRoomState((prev) => ({
          ...(prev || { competitors: [] }),
          problem: data.problem,
          status: prev?.status || "active",
        }));
        setDuelError(null);
      });
      newSocket.on(
        "duelStatusUpdate",
        (data: {
          status: "waiting" | "active" | "finished";
          startTime?: number;
          winner?: string | null;
          forfeitedBy?: string;
        }) => {
          console.log("DuelSocket: Duel status update:", data);
          setDuelRoomState((prev) =>
            prev
              ? {
                  ...prev,
                  status: data.status,
                  startTime:
                    data.startTime !== undefined
                      ? data.startTime
                      : prev.startTime,
                  winner: data.winner !== undefined ? data.winner : prev.winner,
                  forfeitedBy:
                    data.forfeitedBy !== undefined
                      ? data.forfeitedBy
                      : prev.forfeitedBy,
                }
              : null,
          );
        },
      );
      newSocket.on(
        "competitorSolved",
        (data: {
          userId: string;
          role: CompetitorRole;
          submissionTime: number;
        }) => {
          console.log("DuelSocket: Competitor solved:", data);
          setDuelRoomState((prev) => {
            if (!prev) return prev;
            const newComps = prev.competitors.map((c) =>
              c.userId === data.userId && c.role === data.role
                ? {
                    ...c,
                    solvedProblem: true,
                    submissionTime: data.submissionTime,
                  }
                : c,
            );
            return { ...prev, competitors: newComps };
          });
        },
      );
      newSocket.on("ratingsUpdated", (data: RatingsUpdatePayload) => {
        console.log("DuelSocket: Ratings Updated received", data);
        setRatingsUpdate(data);
      });
      newSocket.on("duelError", (data: { message: string }) => {
        console.error("DuelSocket: Duel Error from server:", data.message);
        setDuelError(data.message);
      });
      newSocket.on("connect_error", (err) => {
        console.error("DuelSocket: Connection error:", err.message);
        setDuelError(`Connection failed: ${err.message}`);
        setIsConnected(false);
      });
    }

    return () => {
      if (socketRef.current) {
        console.log("DuelSocket: Cleaning up socket for duel", duelIdToJoin);
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
    };
  }, [duelIdToJoin]);

  // joinDuelRoom now takes AuthUser | null
  const joinDuelRoom = useCallback(
    (
      duelId: string,
      user: AuthUser | null,
      initialCode?: string,
      initialLanguage?: string,
    ) => {
      if (socketRef.current?.connected) {
        // If user is null (anonymous spectator), backend will assign a generic userId/username or handle accordingly
        const payload = {
          duelId,
          userId: user?.id, // Optional: Backend will use socket.data.authUser if available
          username: user?.username, // Optional for same reason
          initialCode,
          initialLanguage,
        };
        console.log(`DuelSocket: Emitting joinDuel:`, payload);
        socketRef.current.emit("joinDuel", payload);
      } else {
        console.warn(
          "DuelSocket: Cannot join duel room - socket not connected.",
        );
      }
    },
    [],
  ); // No dependencies means this function's definition doesn't change

  const sendCodeUpdate = useCallback(
    (duelId: string, user: AuthUser, code: string, role: CompetitorRole) => {
      if (socketRef.current?.connected && user) {
        socketRef.current.emit("codeUpdate", {
          duelId,
          userId: user.id,
          code,
          role,
        });
      }
    },
    [],
  );

  const sendLanguageUpdate = useCallback(
    (
      duelId: string,
      user: AuthUser,
      language: string,
      role: CompetitorRole,
    ) => {
      if (socketRef.current?.connected && user) {
        socketRef.current.emit("languageUpdate", {
          duelId,
          userId: user.id,
          language,
          role,
        });
      }
    },
    [],
  );

  const sendProblemSolved = useCallback(
    (
      duelId: string,
      user: AuthUser,
      role: CompetitorRole,
      submissionTime: number,
    ) => {
      if (socketRef.current?.connected && user) {
        socketRef.current.emit("problemSolved", {
          duelId,
          userId: user.id,
          role,
          submissionTime,
        });
      }
    },
    [],
  );

  return {
    socket: socketRef.current,
    isConnected,
    joinDuelRoom,
    sendCodeUpdate,
    sendLanguageUpdate,
    sendProblemSolved,
    assignedRoleAndUser,
    duelRoomState,
    usersInRoom,
    duelError,
    ratingsUpdate,
  };
};
