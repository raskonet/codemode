import { useEffect, useState, useRef, useCallback } from "react";
import io, { Socket } from "socket.io-client";

// Assuming Problem type is similar to what was in your original App.tsx
// If not, define it or import it appropriately
export interface Problem {
  id: string;
  title: string;
  description: string;
  tests: Array<{ stdin: string; expected: string }>;
  platform: string;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
  metaData?: string;
}

const SOCKET_SERVER_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:4000"
    : "YOUR_PRODUCTION_BACKEND_URL";

export type CompetitorRole = "competitor1" | "competitor2";
export type UserRole = CompetitorRole | "spectator";

export interface DuelUser {
  userId: string;
  role: UserRole;
}

export interface CompetitorState {
  userId: string;
  role: CompetitorRole;
  code: string;
  language: string;
}

export interface DuelRoomState {
  competitors: CompetitorState[];
  problem?: Problem | null; // Add problem to duel state
}

interface UseDuelSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  joinDuelRoom: (
    duelId: string,
    userId: string,
    initialCode?: string,
    initialLanguage?: string,
  ) => void;
  sendCodeUpdate: (
    duelId: string,
    userId: string,
    code: string,
    role: CompetitorRole,
  ) => void;
  sendLanguageUpdate: (
    duelId: string,
    userId: string,
    language: string,
    role: CompetitorRole,
  ) => void;
  assignedRoleAndUser: DuelUser | null;
  duelRoomState: DuelRoomState | null; // Renamed for clarity, includes problem
  usersInRoom: DuelUser[];
  duelError: string | null;
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

  useEffect(() => {
    if (!socketRef.current && duelIdToJoin) {
      // Only connect if there's a duel ID to join initially
      console.log(
        `Attempting to connect to socket server for duel: ${duelIdToJoin}`,
      );
      const newSocket = io(SOCKET_SERVER_URL, {
        // query: { duelId: duelIdToJoin } // Can pass initial duelId in query if server supports
      });
      socketRef.current = newSocket;

      newSocket.on("connect", () => {
        console.log("Socket connected:", newSocket.id);
        setIsConnected(true);
        setDuelError(null);
        const sessionUserId =
          localStorage.getItem("sessionUserId") ||
          `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        localStorage.setItem("sessionUserId", sessionUserId);
        if (duelIdToJoin) {
          // Ensure duelIdToJoin is still relevant
          joinDuelRoom(duelIdToJoin, sessionUserId);
        }
      });

      newSocket.on("disconnect", (reason) => {
        console.log("Socket disconnected:", reason);
        setIsConnected(false);
        // Optionally clear state or show a message
        // setAssignedRoleAndUser(null);
        // setUsersInRoom([]);
        // setDuelRoomState(null);
        if (reason === "io server disconnect") {
          setDuelError("Disconnected by server.");
        } else {
          setDuelError("Connection lost. Attempting to reconnect...");
        }
      });

      newSocket.on(
        "assignedRole",
        (data: { duelId: string; role: UserRole; userId: string }) => {
          console.log("Role assigned:", data);
          setAssignedRoleAndUser({ userId: data.userId, role: data.role });
          setUsersInRoom((prev) => {
            if (!prev.find((u) => u.userId === data.userId))
              return [...prev, { userId: data.userId, role: data.role }];
            return prev.map((u) =>
              u.userId === data.userId ? { ...u, role: data.role } : u,
            );
          });
        },
      );

      newSocket.on(
        "duelState",
        (data: { competitors: CompetitorState[]; problem?: Problem }) => {
          console.log("Received duel state:", data);
          setDuelRoomState(data);
          const competitorUsers = data.competitors.map((c) => ({
            userId: c.userId,
            role: c.role as UserRole,
          })); // Cast role
          setUsersInRoom((prev) => {
            const existingUserIds = new Set(prev.map((u) => u.userId));
            const newUsers = competitorUsers.filter(
              (cu) => !existingUserIds.has(cu.userId),
            );
            // Make sure to update existing users too, roles might change on rejoin
            const updatedExistingUsers = prev.map((exUser) => {
              const updatedUser = competitorUsers.find(
                (cu) => cu.userId === exUser.userId,
              );
              return updatedUser || exUser;
            });
            const combinedUsers = [...updatedExistingUsers];
            newUsers.forEach((nu) => {
              if (!combinedUsers.find((u) => u.userId === nu.userId))
                combinedUsers.push(nu);
            });
            return combinedUsers;
          });
        },
      );

      newSocket.on("userJoined", (data: DuelUser) => {
        console.log("User joined:", data);
        setUsersInRoom((prev) => {
          if (!prev.find((u) => u.userId === data.userId))
            return [...prev, data];
          return prev.map((u) => (u.userId === data.userId ? data : u));
        });
      });

      newSocket.on("userLeft", (data: { userId: string; role: UserRole }) => {
        console.log("User left:", data);
        setUsersInRoom((prev) => prev.filter((u) => u.userId !== data.userId));
        setDuelRoomState((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            competitors: prev.competitors.filter(
              (c) => c.userId !== data.userId,
            ),
          };
        });
      });

      newSocket.on(
        "competitorCodeUpdated",
        (data: { userId: string; role: CompetitorRole; code: string }) => {
          setDuelRoomState((prev) => {
            if (!prev) return { competitors: [{ ...data, language: "cpp" }] };
            const newCompetitors = prev.competitors.map((c) =>
              c.userId === data.userId && c.role === data.role
                ? { ...c, code: data.code }
                : c,
            );
            if (
              !newCompetitors.find(
                (c) => c.userId === data.userId && c.role === data.role,
              )
            ) {
              newCompetitors.push({ ...data, language: "cpp" });
            }
            return { ...prev, competitors: newCompetitors };
          });
        },
      );

      newSocket.on(
        "competitorLanguageUpdated",
        (data: { userId: string; role: CompetitorRole; language: string }) => {
          setDuelRoomState((prev) => {
            if (!prev) return { competitors: [{ ...data, code: "" }] };
            const newCompetitors = prev.competitors.map((c) =>
              c.userId === data.userId && c.role === data.role
                ? { ...c, language: data.language }
                : c,
            );
            if (
              !newCompetitors.find(
                (c) => c.userId === data.userId && c.role === data.role,
              )
            ) {
              newCompetitors.push({ ...data, code: "" });
            }
            return { ...prev, competitors: newCompetitors };
          });
        },
      );

      newSocket.on("duelProblemAssigned", (data: { problem: Problem }) => {
        console.log("Duel problem assigned:", data.problem.title);
        setDuelRoomState((prev) => ({
          ...prev,
          competitors: prev?.competitors || [], // Ensure competitors array exists
          problem: data.problem,
        }));
        setDuelError(null); // Clear previous errors if problem is assigned
      });

      newSocket.on("duelError", (data: { message: string }) => {
        console.error("Duel Error from server:", data.message);
        setDuelError(data.message);
      });

      newSocket.on("connect_error", (err) => {
        console.error("Socket connection error:", err.message);
        setIsConnected(false);
        setDuelError(`Connection failed: ${err.message}`);
      });
    }

    return () => {
      if (socketRef.current) {
        console.log("Disconnecting socket in cleanup...");
        socketRef.current.disconnect();
        socketRef.current = null; // Allow re-creation on next mount if duelIdToJoin changes
        setIsConnected(false);
      }
    };
    // duelIdToJoin is the main dependency that should trigger connection/reconnection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelIdToJoin]);

  const joinDuelRoom = useCallback(
    (
      duelId: string,
      userId: string,
      initialCode?: string,
      initialLanguage?: string,
    ) => {
      if (socketRef.current?.connected) {
        console.log(`Emitting joinDuel: duelId=${duelId}, userId=${userId}`);
        socketRef.current.emit("joinDuel", {
          duelId,
          userId,
          initialCode,
          initialLanguage,
        });
      } else if (socketRef.current) {
        // Socket exists but not connected, it will attempt to join on 'connect'
        console.warn(
          "Socket exists but not connected. Join will be attempted on connect.",
        );
      } else {
        // No socket instance, hook might need duelIdToJoin to initiate connection
        console.warn(
          "No socket instance. Ensure duelIdToJoin is set for the hook to connect.",
        );
      }
    },
    [],
  );

  const sendCodeUpdate = useCallback(
    (duelId: string, userId: string, code: string, role: CompetitorRole) => {
      socketRef.current?.emit("codeUpdate", { duelId, userId, code, role });
    },
    [],
  );

  const sendLanguageUpdate = useCallback(
    (
      duelId: string,
      userId: string,
      language: string,
      role: CompetitorRole,
    ) => {
      socketRef.current?.emit("languageUpdate", {
        duelId,
        userId,
        language,
        role,
      });
    },
    [],
  );

  return {
    socket: socketRef.current,
    isConnected,
    joinDuelRoom,
    sendCodeUpdate,
    sendLanguageUpdate,
    assignedRoleAndUser,
    duelRoomState,
    usersInRoom,
    duelError,
  };
};
