// frontend/src/pages/CompetePage.tsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { gql, useMutation } from "@apollo/client";

import { useAuth } from "../hooks/useAuth";
import { User } from "../contexts/AuthContext"; // Correctly import User type

import {
  useDuelSocket,
  CompetitorRole,
  UserRole as DuelSocketUserRole, // Alias to avoid confusion if UserRole is defined elsewhere
  Problem as DuelProblemType,
  CompetitorState as DuelCompetitorState,
  DuelUser,
} from "../hooks/useDuelSocket";

import { useWebRTC } from "../hooks/useWebRTC";
import CodeEditor from "../components/Editor";
import { Loader2, Video, VideoOff, Trophy, AlertTriangle } from "lucide-react";

// Types specific to this page, if any, or re-used from hooks
interface TestCase {
  stdin: string;
  expected: string;
}
interface CodeSnippet {
  lang: string;
  langSlug: string;
  code: string;
}
interface TestDetail {
  index: number;
  status: string;
  stdout: string | null;
  stderr: string | null;
  time: number | null;
  memory: number | null;
}
interface JudgeResult {
  passed: boolean;
  details: TestDetail[];
}

const JUDGE_SUBMISSION = gql`
  mutation JudgeSubmission($input: JudgeInput!) {
    judgeSubmission(input: $input) {
      passed
      details {
        index
        status
        stdout
        stderr
        time
        memory
      }
    }
  }
`;

type SupportedLanguage = "cpp" | "java" | "python";
const languageDisplayName: Record<SupportedLanguage, string> = {
  cpp: "C++",
  java: "Java",
  python: "Python",
};
const langToLeetCodeLangSlug: Record<SupportedLanguage, string> = {
  cpp: "cpp",
  java: "java",
  python: "python3",
};

const initialCodeSamples: Record<SupportedLanguage, string> = {
  cpp: `#include <iostream>\n#include <vector>\n#include <string>\n\n// Entry point for C++\nint main() {\n    // Your solution here\n    std::cout << "Hello from C++" << std::endl;\n    return 0;\n}`,
  java: `import java.util.*;\nimport java.io.*;\n\n// Entry point for Java\npublic class Main {\n    public static void main(String[] args) {\n        // Your solution here\n        System.out.println("Hello from Java");\n    }\n}`,
  python: `# Entry point for Python\ndef solve():\n    # Your solution here\n    print("Hello from Python")\n\nif __name__ == "__main__":\n    solve()\n`,
};

const VideoPlayer = ({
  stream,
  muted,
  label,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  label: string;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
  }, [stream]);
  return (
    <div className="bg-black rounded-md overflow-hidden shadow-lg relative w-full aspect-video">
      {" "}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-cover"
      />{" "}
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-gray-900">
          <VideoOff size={32} /> <p className="ml-2">{label} (No Stream)</p>
        </div>
      )}{" "}
      {stream && (
        <div className="absolute bottom-1 left-1 text-xs bg-black/50 text-white px-1.5 py-0.5 rounded">
          {label}
        </div>
      )}{" "}
    </div>
  );
};

export default function CompetePage() {
  const { duelId: duelIdFromParams } = useParams<{ duelId: string }>();
  const navigate = useNavigate();
  // Use `user` from useAuth and alias it to `authenticatedUser`
  const {
    user: authenticatedUser,
    isAuthenticated,
    isLoadingAuth,
    authError,
  } = useAuth();

  const [userEnteredDuelId, setUserEnteredDuelId] = useState<string>("");

  const {
    socket,
    isConnected,
    joinDuelRoom,
    sendCodeUpdate,
    sendLanguageUpdate,
    sendProblemSolved,
    assignedRoleAndUser,
    duelRoomState,
    usersInRoom,
    duelError: socketDuelError,
    ratingsUpdate,
  } = useDuelSocket(duelIdFromParams);

  const rtcPeer1 = useWebRTC(socket, socket?.id);
  const rtcPeer2 = useWebRTC(socket, socket?.id);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [hasVideoFeature, setHasVideoFeature] = useState(true); // Default to true for testing video

  const [myCode, setMyCode] = useState<string>(initialCodeSamples["cpp"]); // Default to cpp initial
  const [myLanguage, setMyLanguage] = useState<SupportedLanguage>("cpp");
  const [submissionResult, setSubmissionResult] = useState<JudgeResult | null>(
    null,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [judgeSubmission, { loading: isSubmitting }] = useMutation<{
    judgeSubmission: JudgeResult;
  }>(JUDGE_SUBMISSION, {
    onCompleted: async (data) => {
      setSubmissionResult(data.judgeSubmission);
      setSubmitError(null);
      // Ensure all necessary conditions are met before sending problemSolved
      if (
        data.judgeSubmission.passed &&
        assignedRoleAndUser &&
        authenticatedUser &&
        duelIdFromParams &&
        (assignedRoleAndUser.role === "competitor1" ||
          assignedRoleAndUser.role === "competitor2") &&
        assignedRoleAndUser.userId === authenticatedUser.id
      ) {
        // Ensure it's my submission
        const submissionTime = duelRoomState?.startTime
          ? (Date.now() - duelRoomState.startTime) / 1000
          : 0;
        sendProblemSolved(
          duelIdFromParams,
          authenticatedUser,
          assignedRoleAndUser.role as CompetitorRole,
          submissionTime,
        );
      }
    },
    onError: (error) => {
      setSubmitError(error.message || "Submission failed.");
      setSubmissionResult(null);
    },
  });

  const currentDuelProblem = duelRoomState?.problem;
  // These are based on socket's assignedRoleAndUser, not directly on authUser initially
  const isCompetitor =
    assignedRoleAndUser?.role === "competitor1" ||
    assignedRoleAndUser?.role === "competitor2";
  const isSpectator = assignedRoleAndUser?.role === "spectator";

  // Effect to join duel room
  useEffect(() => {
    if (duelIdFromParams && !isLoadingAuth && isConnected) {
      // If authenticated, join with authUser. If not, join with null user (anonymous spectator).
      const userToJoin = isAuthenticated ? authenticatedUser : null;

      // Condition to join:
      // 1. Not yet assigned a role OR
      // 2. Assigned role's userId doesn't match current authUser's id (e.g. user logged in/out) OR
      // 3. Currently a spectator but now authenticated (might want to become competitor if slot available)
      if (
        !assignedRoleAndUser ||
        (userToJoin && assignedRoleAndUser.userId !== userToJoin.id) ||
        (assignedRoleAndUser.role === "spectator" && isAuthenticated)
      ) {
        console.log(
          `CompetePage: Conditions met to join/re-evaluate role for duel ${duelIdFromParams}. Auth User: ${userToJoin?.username}`,
        );
        const codeForJoin = myCode || initialCodeSamples[myLanguage]; // Send current code/lang as hint
        joinDuelRoom(duelIdFromParams, userToJoin, codeForJoin, myLanguage);
      }
    }
  }, [
    duelIdFromParams,
    authenticatedUser,
    isAuthenticated,
    isLoadingAuth,
    isConnected,
    joinDuelRoom,
    assignedRoleAndUser,
    myCode,
    myLanguage,
  ]);

  // Effect for initializing editor state based on role and duel state
  useEffect(() => {
    const currentRoleInDuel = assignedRoleAndUser?.role;
    const currentUserIdInDuel = assignedRoleAndUser?.userId;

    // Only modify editor if I am the assigned competitor for this role
    if (
      currentRoleInDuel &&
      (currentRoleInDuel === "competitor1" ||
        currentRoleInDuel === "competitor2") &&
      currentUserIdInDuel === authenticatedUser?.id
    ) {
      // My turn to edit

      const myRoleData = duelRoomState?.competitors.find(
        (c) =>
          c.userId === authenticatedUser!.id && c.role === currentRoleInDuel,
      );

      let codeToSet = myRoleData?.code || "";
      const langToSet =
        (myRoleData?.language as SupportedLanguage) || myLanguage; // Default to current local language

      const problem = duelRoomState?.problem;
      const isEffectivelyPlaceholder =
        codeToSet === "" ||
        codeToSet.startsWith("//") ||
        Object.values(initialCodeSamples).includes(codeToSet.trim());

      // Set code from snippet or default only if current code is placeholder or editor is empty
      if (isEffectivelyPlaceholder || myCode.trim() === "") {
        if (problem?.platform === "leetcode" && problem.codeSnippets) {
          const lcSlug = langToLeetCodeLangSlug[langToSet];
          const snippet = problem.codeSnippets.find(
            (cs) => cs.langSlug === lcSlug,
          );
          codeToSet = snippet ? snippet.code : initialCodeSamples[langToSet];
        } else {
          codeToSet = initialCodeSamples[langToSet];
        }
      }
      // Only update if different to prevent cursor jump
      if (codeToSet !== myCode) setMyCode(codeToSet);

      // Sync language
      if (myRoleData?.language && myLanguage !== myRoleData.language) {
        setMyLanguage(myRoleData.language as SupportedLanguage);
      } else if (
        (!myRoleData?.language || myLanguage !== langToSet) &&
        langToSet
      ) {
        setMyLanguage(langToSet);
      }
    } else if (
      currentRoleInDuel === "spectator" ||
      (!currentRoleInDuel && !isLoadingAuth)
    ) {
      setMyCode(
        currentRoleInDuel === "spectator"
          ? "// Spectator Mode: Viewing Duel"
          : "// Waiting for role or login...",
      );
    }
  }, [
    assignedRoleAndUser,
    duelRoomState,
    authenticatedUser,
    myLanguage,
    isLoadingAuth,
  ]); // Removed isCompetitor, isSpectator, use assignedRoleAndUser

  // WebRTC toggle and call logic
  const toggleCamera = async () => {
    if (!hasVideoFeature) return;
    if (isCameraOn) {
      rtcPeer1.localStream?.getTracks().forEach((track) => track.stop());
      rtcPeer1.closeConnection();
      if (rtcPeer2.peerConnection.current) rtcPeer2.closeConnection(); // Also close second P2P if active
      setIsCameraOn(false);
    } else {
      const stream = await rtcPeer1.startLocalStream();
      if (stream) {
        setIsCameraOn(true);
      }
    }
  };

  // WebRTC call initiation/handling logic for competitors
  useEffect(() => {
    if (
      !socket ||
      !isConnected ||
      !hasVideoFeature ||
      !duelIdFromParams ||
      !isCameraOn ||
      !rtcPeer1.localStream ||
      !assignedRoleAndUser ||
      !authenticatedUser
    )
      return;

    const myUserId = authenticatedUser.id;
    const myCurrentRole = assignedRoleAndUser.role;

    if (
      (myCurrentRole === "competitor1" || myCurrentRole === "competitor2") &&
      assignedRoleAndUser.userId === myUserId
    ) {
      const opponent = duelRoomState?.competitors.find(
        (c) =>
          c.userId !== myUserId &&
          (c.role === "competitor1" || c.role === "competitor2"),
      );
      if (
        opponent?.socketId &&
        (!rtcPeer1.isCallInProgress ||
          !rtcPeer1.peerConnection.current?.remoteDescription)
      ) {
        console.log(
          `My Role: ${myCurrentRole}. Opponent found: ${opponent.username}. Initiating call to ${opponent.socketId}`,
        );
        rtcPeer1.initiateCall(opponent.socketId, duelIdFromParams);
      }
    }
  }, [
    socket,
    isConnected,
    hasVideoFeature,
    duelIdFromParams,
    authenticatedUser,
    assignedRoleAndUser,
    duelRoomState?.competitors,
    rtcPeer1,
    isCameraOn, // Rerun if camera turns on or opponent appears
  ]);

  // WebRTC logic for spectators requesting streams AND competitors responding to stream requests
  useEffect(() => {
    if (!socket || !isConnected || !hasVideoFeature || !duelIdFromParams)
      return;

    const myUserId = authenticatedUser?.id;
    const myCurrentRole = assignedRoleAndUser?.role;

    // Spectator: Request streams from known competitors
    if (myCurrentRole === "spectator") {
      const c1 = duelRoomState?.competitors.find(
        (c) => c.role === "competitor1",
      );
      const c2 = duelRoomState?.competitors.find(
        (c) => c.role === "competitor2",
      );
      const targetsToRequest: string[] = [];

      if (
        c1?.socketId &&
        (!rtcPeer1.isCallInProgress || !rtcPeer1.remoteStream)
      )
        targetsToRequest.push(c1.socketId);
      if (
        c2?.socketId &&
        (!rtcPeer2.isCallInProgress || !rtcPeer2.remoteStream)
      )
        targetsToRequest.push(c2.socketId);

      if (targetsToRequest.length > 0) {
        console.log(
          "Spectator: Requesting streams from competitors:",
          targetsToRequest,
        );
        socket.emit("requestStreams", {
          duelId: duelIdFromParams,
          targetSocketIds: targetsToRequest,
        });
      }
    }

    // Competitor: Listen for stream requests from spectators
    const handleStreamRequest = (data: {
      spectatorSocketId: string;
      duelId: string;
    }) => {
      if (
        (myCurrentRole === "competitor1" || myCurrentRole === "competitor2") &&
        assignedRoleAndUser?.userId === myUserId && // I am the authenticated competitor for this role
        isCameraOn &&
        rtcPeer1.localStream && // My camera is on
        data.duelId === duelIdFromParams
      ) {
        console.log(
          `Competitor ${myCurrentRole}: Spectator ${data.spectatorSocketId} requests stream. Initiating call.`,
        );
        // This simplified example uses rtcPeer2 for the *first* spectator request.
        // A real app would need a map of peer connections for multiple spectators.
        if (
          !rtcPeer2.isCallInProgress ||
          !rtcPeer2.peerConnection.current?.remoteDescription
        ) {
          rtcPeer2.initiateCall(data.spectatorSocketId, duelIdFromParams);
        } else {
          console.warn(
            `Competitor ${myCurrentRole}: Already have a P2P with rtcPeer2 or call in progress. Cannot connect to another spectator with this simple setup.`,
          );
        }
      }
    };
    socket.on("streamRequestedBySpectator", handleStreamRequest);
    return () => {
      socket.off("streamRequestedBySpectator", handleStreamRequest);
    };
  }, [
    socket,
    isConnected,
    hasVideoFeature,
    duelIdFromParams,
    authenticatedUser,
    assignedRoleAndUser,
    duelRoomState?.competitors,
    rtcPeer1,
    rtcPeer2,
    isCameraOn, // Dependencies for initiating/handling requests
  ]);

  const handleJoinDuel = () => {
    if (userEnteredDuelId) navigate(`/compete/${userEnteredDuelId.trim()}`);
  };

  const handleMyCodeChange = (newCode: string) => {
    setMyCode(newCode);
    if (
      duelIdFromParams &&
      assignedRoleAndUser &&
      authenticatedUser &&
      assignedRoleAndUser.userId === authenticatedUser.id &&
      isCompetitor
    ) {
      sendCodeUpdate(
        duelIdFromParams,
        authenticatedUser,
        newCode,
        assignedRoleAndUser.role as CompetitorRole,
      );
    }
  };

  const handleMyLanguageChange = (newLangString: string) => {
    const newLanguage = newLangString as SupportedLanguage;
    // Update local state immediately for editor responsiveness
    // This will also trigger the useEffect for editor init if code is placeholder
    setMyLanguage(newLanguage);

    let newCodeToUse = myCode; // By default, keep current code
    const problem = duelRoomState?.problem;
    // Check if current code is one of the initial samples or empty/comment
    const isEffectivelyPlaceholder =
      myCode.trim() === "" ||
      myCode.startsWith("//") ||
      Object.values(initialCodeSamples).some(
        (sample) => myCode.trim() === sample.trim(),
      );

    if (isEffectivelyPlaceholder) {
      if (problem?.platform === "leetcode" && problem.codeSnippets) {
        const lcSlug = langToLeetCodeLangSlug[newLanguage];
        const snippet = problem.codeSnippets.find(
          (cs) => cs.langSlug === lcSlug,
        );
        newCodeToUse = snippet ? snippet.code : initialCodeSamples[newLanguage];
      } else {
        newCodeToUse = initialCodeSamples[newLanguage];
      }
      setMyCode(newCodeToUse); // Update code if it was a placeholder
    }

    if (
      duelIdFromParams &&
      assignedRoleAndUser &&
      authenticatedUser &&
      assignedRoleAndUser.userId === authenticatedUser.id &&
      isCompetitor
    ) {
      sendLanguageUpdate(
        duelIdFromParams,
        authenticatedUser,
        newLanguage,
        assignedRoleAndUser.role as CompetitorRole,
      );
      // If code was changed to snippet/default, send that update too
      if (newCodeToUse !== myCode && isEffectivelyPlaceholder) {
        sendCodeUpdate(
          duelIdFromParams,
          authenticatedUser,
          newCodeToUse,
          assignedRoleAndUser.role as CompetitorRole,
        );
      }
    }
  };

  const handleSubmitSolution = () => {
    const problem = duelRoomState?.problem;
    if (!problem || !problem.tests) {
      alert("No problem or tests available.");
      return;
    }
    if (
      !isCompetitor ||
      !authenticatedUser ||
      assignedRoleAndUser?.userId !== authenticatedUser.id
    ) {
      alert("Only your assigned competitor role can submit.");
      return;
    }
    setSubmitError(null);
    setSubmissionResult(null);
    let leetCodeProblemDataPayload;
    if (
      problem.platform === "leetcode" &&
      problem.codeSnippets &&
      problem.metaData
    ) {
      const lcSlug = langToLeetCodeLangSlug[myLanguage];
      const relevantSnippet = problem.codeSnippets.find(
        (cs) => cs.langSlug === lcSlug,
      );
      if (relevantSnippet && problem.metaData) {
        leetCodeProblemDataPayload = {
          codeSnippet: {
            lang: relevantSnippet.lang,
            langSlug: relevantSnippet.langSlug,
            code: relevantSnippet.code,
          },
          metaData: problem.metaData,
        };
      }
    }
    judgeSubmission({
      variables: {
        input: {
          code: myCode,
          lang: myLanguage,
          tests: problem.tests.map(({ stdin, expected }) => ({
            stdin,
            expected,
          })),
          ...(leetCodeProblemDataPayload && {
            leetCodeProblemData: leetCodeProblemDataPayload,
          }),
        },
      },
    });
  };

  const competitor1Data = useMemo(
    () => duelRoomState?.competitors.find((c) => c.role === "competitor1"),
    [duelRoomState?.competitors],
  );
  const competitor2Data = useMemo(
    () => duelRoomState?.competitors.find((c) => c.role === "competitor2"),
    [duelRoomState?.competitors],
  );

  // UI Rendering sections
  if (isLoadingAuth && !assignedRoleAndUser && !duelIdFromParams) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-sky-400" />{" "}
        <span className="ml-4 text-xl">Loading Authentication...</span>
      </div>
    );
  }

  if (duelIdFromParams && !isLoadingAuth && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
        <AlertTriangle size={48} className="text-yellow-400 mb-4" />
        <h2 className="text-2xl mb-2 font-semibold">Authentication Required</h2>
        <p className="mb-6 text-gray-300 text-center">
          Please log in to join or spectate duel{" "}
          <span className="font-semibold text-sky-400">{duelIdFromParams}</span>
          .
        </p>
        <Link
          to={`/login?redirect=/compete/${duelIdFromParams}`}
          className="px-6 py-2.5 bg-sky-500 hover:bg-sky-600 rounded-lg text-white font-semibold shadow-md transition-colors"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  if (!duelIdFromParams) {
    return (
      <div className="p-6 text-white bg-gray-900 min-h-screen flex flex-col items-center justify-center">
        <h1 className="text-3xl mb-6 font-bold">Join or Create a Duel</h1>
        {isLoadingAuth && (
          <Loader2 className="h-8 w-8 animate-spin text-sky-400 mb-4" />
        )}
        {(socketDuelError || authError) && !isLoadingAuth && (
          <p className="mb-4 text-red-400 bg-red-900/50 p-3 rounded-md border border-red-700">
            {socketDuelError || authError}
          </p>
        )}
        {!isLoadingAuth && !isAuthenticated && (
          <p className="mb-4 text-yellow-300">
            You can join as a spectator or{" "}
            <Link to="/login" className="underline hover:text-sky-300">
              log in
            </Link>{" "}
            to compete.
          </p>
        )}

        <div className="flex items-center">
          <input
            type="text"
            placeholder="Enter Duel ID"
            value={userEnteredDuelId}
            onChange={(e) => setUserEnteredDuelId(e.target.value)}
            className="p-3 border border-gray-600 rounded-l bg-gray-700 text-white focus:ring-2 focus:ring-sky-500 outline-none"
          />
          <button
            onClick={handleJoinDuel}
            className="p-3 bg-blue-600 text-white rounded-r hover:bg-blue-700 font-semibold"
          >
            Join / Create
          </button>
        </div>
        <p className="mt-3 text-sm text-gray-400">
          If the Duel ID doesn't exist, a new room will be created.
        </p>
      </div>
    );
  }

  const problemToDisplay = duelRoomState?.problem;
  const myActualRole = assignedRoleAndUser?.role;
  const myUserId = authenticatedUser?.id;
  const isMyEditorActive =
    isAuthenticated &&
    myUserId === assignedRoleAndUser?.userId &&
    (myActualRole === "competitor1" || myActualRole === "competitor2");
  const opponentData =
    myActualRole === "competitor1" ? competitor2Data : competitor1Data;

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white p-1 md:p-4">
      <header className="mb-2 md:mb-4 px-2">
        <div className="flex justify-between items-center">
          <h1 className="text-xl md:text-3xl font-bold">
            Duel Room: <span className="text-sky-400">{duelIdFromParams}</span>
          </h1>
          {hasVideoFeature &&
            isCompetitor &&
            authenticatedUser?.id === assignedRoleAndUser?.userId && (
              <button
                onClick={toggleCamera}
                className={`p-2 rounded-md text-sm flex items-center transition-colors shadow-md
                        ${isCameraOn ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}`}
              >
                {isCameraOn ? (
                  <VideoOff size={16} className="mr-1" />
                ) : (
                  <Video size={16} className="mr-1" />
                )}
                {isCameraOn ? "Cam Off" : "Cam On"}
              </button>
            )}
        </div>
        {isLoadingAuth && <p className="text-sm text-sky-300">Auth check...</p>}
        {authenticatedUser && (
          <p className="text-md">
            User: {authenticatedUser.username} (Role:{" "}
            <span className="font-semibold text-yellow-400">
              {assignedRoleAndUser?.role ||
                (isLoadingAuth
                  ? "Checking..."
                  : isConnected
                    ? "Assigning..."
                    : "Connecting...")}
            </span>
            )
          </p>
        )}
        {!authenticatedUser && !isLoadingAuth && (
          <p className="text-md text-yellow-300">
            Spectating anonymously.{" "}
            <Link
              to={`/login?redirect=/compete/${duelIdFromParams}`}
              className="underline"
            >
              Login
            </Link>{" "}
            to compete.
          </p>
        )}
        <p className="text-sm">
          Socket:{" "}
          {isConnected ? (
            <span className="text-green-400">Connected</span>
          ) : (
            <span className="text-red-400">Disconnected</span>
          )}
        </p>
        {socketDuelError && (
          <p className="mt-1 text-sm text-red-400 bg-red-800/50 px-2 py-1 rounded border border-red-700">
            Duel Error: {socketDuelError}
          </p>
        )}
        {authError && (
          <p className="mt-1 text-sm text-red-400 bg-red-800/50 px-2 py-1 rounded border border-red-700">
            Auth Error: {authError}
          </p>
        )}
        <div className="mt-1 text-xs">
          {" "}
          Users:{" "}
          {usersInRoom
            .map(
              (u) => `${u.username || u.userId.substring(0, 8)}...(${u.role})`,
            )
            .join(", ") || "Waiting for users..."}{" "}
        </div>
        {ratingsUpdate &&
          assignedRoleAndUser &&
          ratingsUpdate[assignedRoleAndUser.userId] && (
            <p className="text-sm mt-1">
              Your rating: {ratingsUpdate[assignedRoleAndUser.userId].oldRating}{" "}
              →{" "}
              <span className="font-bold text-lg">
                {ratingsUpdate[assignedRoleAndUser.userId].newRating}
              </span>
              (
              {ratingsUpdate[assignedRoleAndUser.userId].newRating -
                ratingsUpdate[assignedRoleAndUser.userId].oldRating >=
              0
                ? "+"
                : ""}
              {ratingsUpdate[assignedRoleAndUser.userId].newRating -
                ratingsUpdate[assignedRoleAndUser.userId].oldRating}
              )
            </p>
          )}
      </header>

      <div
        className={`flex-grow grid ${isSpectator ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"} gap-2 md:gap-4 overflow-hidden`}
      >
        <div
          className={`${isSpectator ? "md:col-span-1" : "md:col-span-1"} flex flex-col gap-4`}
        >
          <div className="bg-gray-800 p-3 rounded shadow-lg overflow-y-auto flex-grow min-h-[200px]">
            {problemToDisplay ? (
              <div className="prose prose-sm prose-invert max-w-none">
                {" "}
                <h2 className="text-xl font-semibold text-green-400">
                  {problemToDisplay.title}
                </h2>{" "}
                <div
                  dangerouslySetInnerHTML={{
                    __html: problemToDisplay.description,
                  }}
                />{" "}
                {problemToDisplay.platform === "leetcode" &&
                  problemToDisplay.metaData && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer">
                        View MetaData
                      </summary>
                      <pre>
                        {JSON.stringify(
                          JSON.parse(problemToDisplay.metaData),
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  )}{" "}
              </div>
            ) : (
              <p className="text-gray-400 p-4">
                {isLoadingAuth && !assignedRoleAndUser
                  ? "Initializing..."
                  : "Waiting for problem..."}
              </p>
            )}
          </div>
          {hasVideoFeature && (
            <div
              className={`grid ${isCompetitor ? "grid-cols-2" : "grid-cols-1"} gap-2`}
            >
              {isCompetitor && (
                <VideoPlayer
                  stream={rtcPeer1.localStream}
                  muted
                  label={`${authenticatedUser?.username || "My"} Camera`}
                />
              )}
              {isCompetitor && opponentData && (
                <VideoPlayer
                  stream={rtcPeer1.remoteStream}
                  label={`${opponentData.username || "Opponent"}`}
                />
              )}
              {isCompetitor && !opponentData && (
                <div className="aspect-video bg-gray-850 rounded-md flex items-center justify-center text-gray-500">
                  <VideoOff size={24} className="mr-2" />
                  Opponent Offline
                </div>
              )}

              {isSpectator && competitor1Data && (
                <VideoPlayer
                  stream={rtcPeer1.remoteStream}
                  label={`C1: ${competitor1Data.username}`}
                />
              )}
              {isSpectator && !competitor1Data && (
                <div className="aspect-video bg-gray-850 rounded-md flex items-center justify-center text-gray-500">
                  <VideoOff size={24} className="mr-2" />
                  C1 Offline
                </div>
              )}

              {isSpectator && competitor2Data && (
                <VideoPlayer
                  stream={rtcPeer2.remoteStream}
                  label={`C2: ${competitor2Data.username}`}
                />
              )}
              {isSpectator && !competitor2Data && (
                <div className="aspect-video bg-gray-850 rounded-md flex items-center justify-center text-gray-500">
                  <VideoOff size={24} className="mr-2" />
                  C2 Offline
                </div>
              )}
            </div>
          )}
        </div>

        <div
          className={`${isSpectator ? "md:col-span-2" : "md:col-span-1"} grid ${isSpectator ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"} gap-2 md:gap-4 overflow-hidden`}
        >
          {isMyEditorActive && (
            <div className="flex flex-col h-full bg-gray-800 p-3 rounded shadow-lg">
              <div className="flex justify-between items-center mb-2">
                {" "}
                <h2 className="text-lg font-semibold">
                  Your Editor ({assignedRoleAndUser?.role})
                </h2>{" "}
                <select
                  value={myLanguage}
                  onChange={(e) => handleMyLanguageChange(e.target.value)}
                  className="p-2 bg-gray-700 rounded text-white border border-gray-600 text-sm"
                >
                  {" "}
                  {(
                    Object.keys(languageDisplayName) as SupportedLanguage[]
                  ).map((langKey) => (
                    <option key={langKey} value={langKey}>
                      {languageDisplayName[langKey]}
                    </option>
                  ))}{" "}
                </select>{" "}
              </div>
              <div className="flex-grow min-h-[300px] md:min-h-[calc(100%-120px)] border border-gray-700 rounded">
                {" "}
                <CodeEditor
                  language={myLanguage}
                  value={myCode}
                  onChange={handleMyCodeChange}
                />{" "}
              </div>
              {problemToDisplay && (
                <button
                  onClick={handleSubmitSolution}
                  className="mt-3 p-2 w-full bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 font-semibold"
                  disabled={
                    isSubmitting ||
                    !problemToDisplay?.tests?.length ||
                    duelRoomState?.status === "finished"
                  }
                >
                  {" "}
                  {isSubmitting
                    ? "Submitting..."
                    : duelRoomState?.status === "finished"
                      ? duelRoomState.winner === authenticatedUser?.id
                        ? "You Won!"
                        : duelRoomState.winner
                          ? "Duel Over"
                          : "Submit Solution"
                      : "Submit Solution"}{" "}
                </button>
              )}
            </div>
          )}
          {isSpectator && (
            <>
              <div className="flex flex-col h-full bg-gray-800 p-3 rounded shadow-lg">
                {" "}
                <h2 className="text-lg font-semibold mb-2">
                  C1: {competitor1Data?.username || "N/A"}
                </h2>{" "}
                {competitor1Data ? (
                  <>
                    {" "}
                    <div className="flex-grow min-h-[300px] md:min-h-0 border border-gray-700 rounded bg-gray-850">
                      {" "}
                      <CodeEditor
                        language={
                          (competitor1Data.language as SupportedLanguage) ||
                          "plaintext"
                        }
                        value={competitor1Data.code || ""}
                        onChange={() => {}}
                      />{" "}
                    </div>{" "}
                    <p className="text-xs p-1 bg-gray-700 mt-1 rounded">
                      Lang:{" "}
                      {languageDisplayName[
                        competitor1Data.language as SupportedLanguage
                      ] || "N/A"}
                    </p>{" "}
                  </>
                ) : (
                  <div className="flex-grow flex items-center justify-center text-gray-500">
                    Waiting...
                  </div>
                )}{" "}
              </div>
              <div className="flex flex-col h-full bg-gray-800 p-3 rounded shadow-lg">
                {" "}
                <h2 className="text-lg font-semibold mb-2">
                  C2: {competitor2Data?.username || "N/A"}
                </h2>{" "}
                {competitor2Data ? (
                  <>
                    {" "}
                    <div className="flex-grow min-h-[300px] md:min-h-0 border border-gray-700 rounded bg-gray-850">
                      {" "}
                      <CodeEditor
                        language={
                          (competitor2Data.language as SupportedLanguage) ||
                          "plaintext"
                        }
                        value={competitor2Data.code || ""}
                        onChange={() => {}}
                      />{" "}
                    </div>{" "}
                    <p className="text-xs p-1 bg-gray-700 mt-1 rounded">
                      Lang:{" "}
                      {languageDisplayName[
                        competitor2Data.language as SupportedLanguage
                      ] || "N/A"}
                    </p>{" "}
                  </>
                ) : (
                  <div className="flex-grow flex items-center justify-center text-gray-500">
                    Waiting...
                  </div>
                )}{" "}
              </div>
            </>
          )}
          {!isMyEditorActive &&
            !isSpectator &&
            authenticatedUser &&
            duelIdFromParams /* Show if I'm authenticated but not yet assigned as active competitor */ && (
              <div className="flex items-center justify-center text-gray-400 md:col-span-1">
                Attempting to join duel as competitor...
              </div>
            )}
        </div>
      </div>

      {(submissionResult || submitError) && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-700/95 backdrop-blur-sm border-t-2 border-gray-600 shadow-2xl max-h-48 md:max-h-60 overflow-y-auto z-50">
          {" "}
          <button
            onClick={() => {
              setSubmissionResult(null);
              setSubmitError(null);
            }}
            className="absolute top-2 right-3 text-gray-300 hover:text-white text-2xl font-bold"
            aria-label="Close submission panel"
          >
            ×
          </button>{" "}
          {submissionResult && (
            <>
              {" "}
              <h3
                className={`text-lg font-semibold mb-2 ${submissionResult.passed ? "text-green-300" : "text-red-300"}`}
              >
                {" "}
                Submission:{" "}
                {submissionResult.passed
                  ? "All Tests Passed!"
                  : "Some Tests Failed"}{" "}
              </h3>{" "}
              {submissionResult.details.map((detail) => (
                <div
                  key={detail.index}
                  className={`mb-1 p-1.5 text-xs rounded ${detail.status === "Accepted" ? "bg-green-800/80" : "bg-red-800/80"}`}
                >
                  {" "}
                  <p>
                    Test {detail.index + 1}: {detail.status} (Time:{" "}
                    {detail.time?.toFixed(3) ?? "N/A"}s, Mem:{" "}
                    {detail.memory ?? "N/A"}KB)
                  </p>{" "}
                  {detail.stderr && (
                    <pre className="text-red-200 bg-black/60 p-1 mt-1 rounded whitespace-pre-wrap">
                      Stderr: {detail.stderr}
                    </pre>
                  )}{" "}
                  {detail.stdout && detail.status !== "Accepted" && (
                    <pre className="text-yellow-200 bg-black/60 p-1 mt-1 rounded whitespace-pre-wrap">
                      Stdout: {detail.stdout}
                    </pre>
                  )}{" "}
                </div>
              ))}{" "}
            </>
          )}{" "}
          {submitError && (
            <p className="text-red-300 font-semibold">
              Submission Error: {submitError}
            </p>
          )}{" "}
        </div>
      )}
      {duelRoomState?.status === "finished" && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-gray-800 p-8 rounded-lg shadow-xl text-center">
            <Trophy size={48} className="text-yellow-400 mx-auto mb-4" />
            <h2 className="text-3xl font-bold mb-3">Duel Finished!</h2>
            {duelRoomState.winner ? (
              <p className="text-xl">
                Winner:{" "}
                <span className="text-green-400 font-semibold">
                  {usersInRoom.find((u) => u.userId === duelRoomState.winner)
                    ?.username || duelRoomState.winner}
                </span>
              </p>
            ) : (
              <p className="text-xl">It's a Draw!</p>
            )}
            {duelRoomState.forfeitedBy && (
              <p className="text-sm text-red-400">
                (User{" "}
                {usersInRoom.find((u) => u.userId === duelRoomState.forfeitedBy)
                  ?.username || duelRoomState.forfeitedBy}{" "}
                forfeited)
              </p>
            )}
            <button
              onClick={() => navigate("/compete")}
              className="mt-6 bg-sky-500 hover:bg-sky-600 px-6 py-2 rounded font-semibold"
            >
              New Duel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
