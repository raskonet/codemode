import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { gql, useMutation } from "@apollo/client";
import toast from "react-hot-toast";

import { useAuth } from "../hooks/useAuth";
import { User } from "../contexts/AuthContext";

import {
  useDuelSocket,
  CompetitorRole,
  Problem as DuelProblemType,
} from "../hooks/useDuelSocket";

import { useWebRTC } from "../hooks/useWebRTC";
import CodeEditor from "../components/Editor";
import {
  Loader2,
  Video,
  VideoOff,
  Trophy,
  AlertTriangle,
  Send,
  Swords,
  UserCircle2,
  Eye,
  XCircle,
} from "lucide-react";

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
  cpp: `#include <iostream>\n#include <vector>\n#include <string>\n\n// Happy Dueling in C++!\nint main() {\n    // Your solution here\n    std::cout << "Hello Duelist!" << std::endl;\n    return 0;\n}`,
  java: `import java.util.*;\nimport java.io.*;\n\n// Happy Dueling in Java!\npublic class Main {\n    public static void main(String[] args) {\n        // Your solution here\n        System.out.println("Hello Duelist!");\n    }\n}`,
  python: `# Happy Dueling in Python!\ndef solve():\n    # Your solution here\n    print("Hello Duelist!")\n\nif __name__ == "__main__":\n    solve()\n`,
};

const VideoPlayer = ({
  stream,
  muted,
  label,
  isLocal,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  label: string;
  isLocal?: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
  }, [stream]);
  return (
    <div
      className={`bg-gray-800 rounded-lg overflow-hidden shadow-lg relative w-full aspect-video border-2 ${isLocal && stream ? "border-sky-500" : "border-gray-700"}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-cover"
      />
      {!stream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-gray-850/80">
          <VideoOff size={32} />
          <p className="mt-2 text-xs text-center">{label}</p>
        </div>
      )}
      {stream && (
        <div className="absolute bottom-1.5 left-1.5 text-xs bg-black/60 text-white px-2 py-1 rounded-md">
          {label}
        </div>
      )}
    </div>
  );
};

export default function CompetePage() {
  const { duelId: duelIdFromParams } = useParams<{ duelId: string }>();
  const navigate = useNavigate();
  const { user: authenticatedUser, isAuthenticated, isLoadingAuth } = useAuth();
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
  const rtcPeer2 = useWebRTC(socket, socket?.id); // For spectator to competitor 2 or competitor to spectator 2
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [hasVideoFeature] = useState(true); // Set to true to enable video features

  const [myCode, setMyCode] = useState<string>(initialCodeSamples["cpp"]);
  const [myLanguage, setMyLanguage] = useState<SupportedLanguage>("cpp");
  const [submissionResult, setSubmissionResult] = useState<JudgeResult | null>(
    null,
  );

  const [judgeSubmission, { loading: isSubmitting }] = useMutation<{
    judgeSubmission: JudgeResult;
  }>(JUDGE_SUBMISSION, {
    onCompleted: async (data) => {
      setSubmissionResult(data.judgeSubmission);
      toast.success(
        data.judgeSubmission.passed
          ? "All tests passed!"
          : "Some tests failed.",
        { id: "submissionToast" },
      );
      if (
        data.judgeSubmission.passed &&
        assignedRoleAndUser &&
        authenticatedUser &&
        duelIdFromParams &&
        (assignedRoleAndUser.role === "competitor1" ||
          assignedRoleAndUser.role === "competitor2") &&
        assignedRoleAndUser.userId === authenticatedUser.id
      ) {
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
      toast.error(error.message || "Submission failed.", {
        id: "submissionToast",
      });
      setSubmissionResult(null);
    },
  });

  const currentDuelProblem = duelRoomState?.problem;
  const isCompetitor =
    assignedRoleAndUser?.role === "competitor1" ||
    assignedRoleAndUser?.role === "competitor2";
  const isSpectator = assignedRoleAndUser?.role === "spectator";

  useEffect(() => {
    if (duelIdFromParams && !isLoadingAuth && isConnected) {
      const userToJoin = isAuthenticated ? authenticatedUser : null;
      if (
        !assignedRoleAndUser ||
        (userToJoin && assignedRoleAndUser.userId !== userToJoin.id) ||
        (assignedRoleAndUser.role === "spectator" && isAuthenticated)
      ) {
        const codeForJoin = myCode || initialCodeSamples[myLanguage];
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

  useEffect(() => {
    const currentRoleInDuel = assignedRoleAndUser?.role;
    const currentUserIdInDuel = assignedRoleAndUser?.userId;

    if (
      currentRoleInDuel &&
      (currentRoleInDuel === "competitor1" ||
        currentRoleInDuel === "competitor2") &&
      currentUserIdInDuel === authenticatedUser?.id
    ) {
      const myRoleData = duelRoomState?.competitors.find(
        (c) =>
          c.userId === authenticatedUser!.id && c.role === currentRoleInDuel,
      );
      let codeToSet = myRoleData?.code || "";
      const langToSet =
        (myRoleData?.language as SupportedLanguage) || myLanguage;
      const problem = duelRoomState?.problem;
      const isEffectivelyPlaceholder =
        codeToSet === "" ||
        codeToSet.startsWith("// Happy Dueling") ||
        Object.values(initialCodeSamples).includes(codeToSet.trim());

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
      if (codeToSet !== myCode) setMyCode(codeToSet);
      if (myRoleData?.language && myLanguage !== myRoleData.language)
        setMyLanguage(myRoleData.language as SupportedLanguage);
      else if ((!myRoleData?.language || myLanguage !== langToSet) && langToSet)
        setMyLanguage(langToSet);
    } else if (
      currentRoleInDuel === "spectator" ||
      (!currentRoleInDuel && !isLoadingAuth)
    ) {
      setMyCode(
        currentRoleInDuel === "spectator"
          ? "// Spectator Mode: Viewing Duel..."
          : "// Waiting for role or login...",
      );
    }
  }, [
    assignedRoleAndUser,
    duelRoomState,
    authenticatedUser,
    myLanguage,
    isLoadingAuth,
  ]);

  const toggleCamera = async () => {
    if (!hasVideoFeature) return;
    if (isCameraOn) {
      rtcPeer1.localStream?.getTracks().forEach((track) => track.stop());
      rtcPeer1.closeConnection();
      if (rtcPeer2.peerConnection.current) rtcPeer2.closeConnection();
      setIsCameraOn(false);
      toast("Camera turned off.", { icon: "📹" });
    } else {
      const stream = await rtcPeer1.startLocalStream();
      if (stream) {
        setIsCameraOn(true);
        toast.success("Camera turned on!", { icon: "🎥" });
      } else {
        toast.error("Failed to start camera. Check permissions.", {
          icon: "🚫",
        });
      }
    }
  };

  useEffect(() => {
    // WebRTC for Competitors
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
    isCameraOn,
  ]);

  useEffect(() => {
    // WebRTC for Spectators and Competitor responses to spectators
    if (!socket || !isConnected || !hasVideoFeature || !duelIdFromParams)
      return;
    const myUserId = authenticatedUser?.id;
    const myCurrentRole = assignedRoleAndUser?.role;

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
        (!rtcPeer2.isCallInProgress || !rtcPeer2.remoteStream) &&
        c1?.socketId !== c2?.socketId
      )
        targetsToRequest.push(c2.socketId);
      if (targetsToRequest.length > 0) {
        socket.emit("requestStreams", {
          duelId: duelIdFromParams,
          targetSocketIds: targetsToRequest,
        });
      }
    }

    const handleStreamRequest = (data: {
      spectatorSocketId: string;
      duelId: string;
    }) => {
      if (
        (myCurrentRole === "competitor1" || myCurrentRole === "competitor2") &&
        assignedRoleAndUser?.userId === myUserId &&
        isCameraOn &&
        rtcPeer1.localStream &&
        data.duelId === duelIdFromParams
      ) {
        // Use rtcPeer2 for competitor-to-spectator. A real app would map connections.
        if (
          !rtcPeer2.isCallInProgress ||
          !rtcPeer2.peerConnection.current?.remoteDescription
        ) {
          rtcPeer2.initiateCall(data.spectatorSocketId, duelIdFromParams);
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
    isCameraOn,
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
    setMyLanguage(newLanguage);
    let newCodeToUse = myCode;
    const problem = duelRoomState?.problem;
    const isEffectivelyPlaceholder =
      myCode.trim() === "" ||
      myCode.startsWith("// Happy Dueling") ||
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
      setMyCode(newCodeToUse);
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
    toast.loading("Submitting your solution...", { id: "submissionToast" });
    const problem = duelRoomState?.problem;
    if (!problem || !problem.tests) {
      toast.error("No problem or tests available.", { id: "submissionToast" });
      return;
    }
    if (
      !isCompetitor ||
      !authenticatedUser ||
      assignedRoleAndUser?.userId !== authenticatedUser.id
    ) {
      toast.error("Only your assigned competitor role can submit.", {
        id: "submissionToast",
      });
      return;
    }

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

  if (isLoadingAuth && !assignedRoleAndUser && !duelIdFromParams) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-sky-500" />
      </div>
    );
  }
  if (duelIdFromParams && !isLoadingAuth && !isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle size={60} className="text-yellow-400 mb-6" />
        <h2 className="text-3xl mb-3 font-semibold">Authentication Required</h2>
        <p className="mb-8 text-gray-300 max-w-md">
          Please log in to join or spectate duel{" "}
          <span className="font-bold text-sky-300">{duelIdFromParams}</span>.
          This ensures a fair and accountable dueling environment.
        </p>
        <Link
          to={`/login?redirect=/compete/${duelIdFromParams}`}
          className="btn btn-primary text-lg"
        >
          Go to Login
        </Link>
      </div>
    );
  }
  if (!duelIdFromParams) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Swords size={64} className="text-sky-400 mb-6" />
        <h1 className="text-4xl mb-8 font-bold">Join or Create a Duel</h1>
        {isLoadingAuth && (
          <Loader2 className="h-10 w-10 animate-spin text-sky-400 mb-5" />
        )}
        {socketDuelError && !isLoadingAuth && (
          <p className="mb-5 text-red-400 bg-red-900/50 p-3.5 rounded-lg border border-red-700">
            {socketDuelError}
          </p>
        )}
        {!isLoadingAuth && !isAuthenticated && (
          <p className="mb-5 text-yellow-300">
            You can join as a spectator or{" "}
            <Link
              to="/login"
              className="underline hover:text-sky-300 font-semibold"
            >
              log in
            </Link>{" "}
            to compete.
          </p>
        )}
        <div className="flex items-center shadow-lg">
          <input
            type="text"
            placeholder="Enter Duel ID"
            value={userEnteredDuelId}
            onChange={(e) => setUserEnteredDuelId(e.target.value)}
            className="p-3.5 border-2 border-gray-600 rounded-l-lg bg-gray-700 text-white focus:ring-2 focus:ring-sky-500 outline-none text-lg w-72"
          />
          <button
            onClick={handleJoinDuel}
            className="p-3.5 bg-sky-600 text-white rounded-r-lg hover:bg-sky-500 font-semibold text-lg border-2 border-sky-600 hover:border-sky-500 h-full flex items-center"
          >
            <Swords size={20} className="mr-2" /> Join / Create
          </button>
        </div>
        <p className="mt-4 text-sm text-gray-400">
          If the Duel ID doesn't exist, a new room will be created for you.
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
    <div className="flex flex-col h-[calc(100vh-60px)] bg-gray-850 p-2 md:p-3">
      {" "}
      {/* Adjusted overall padding and height */}
      <header className="mb-3 px-2">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h1 className="text-xl md:text-2xl font-bold">
            Duel: <span className="text-sky-400">{duelIdFromParams}</span>
            {duelRoomState?.status === "active" && (
              <span className="ml-2 text-xs px-2 py-0.5 bg-red-500 text-white rounded-full animate-pulse">
                LIVE
              </span>
            )}
            {duelRoomState?.status === "waiting" && (
              <span className="ml-2 text-xs px-2 py-0.5 bg-yellow-500 text-gray-800 rounded-full">
                WAITING
              </span>
            )}
          </h1>
          {hasVideoFeature &&
            isCompetitor &&
            authenticatedUser?.id === assignedRoleAndUser?.userId && (
              <button
                onClick={toggleCamera}
                className={`btn btn-sm ${isCameraOn ? "btn-danger" : "btn-success"} flex items-center`}
              >
                {isCameraOn ? (
                  <VideoOff size={16} className="mr-1.5" />
                ) : (
                  <Video size={16} className="mr-1.5" />
                )}
                {isCameraOn ? "Cam Off" : "Cam On"}
              </button>
            )}
        </div>
        <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
          <span>
            Socket:{" "}
            {isConnected ? (
              <span className="text-green-400 font-semibold">Connected</span>
            ) : (
              <span className="text-red-400 font-semibold">Disconnected</span>
            )}
          </span>
          {authenticatedUser && (
            <span>
              Role:{" "}
              <span className="font-semibold text-yellow-300">
                {assignedRoleAndUser?.role ||
                  (isLoadingAuth
                    ? "Checking..."
                    : isConnected
                      ? "Assigning..."
                      : "Connecting...")}
              </span>
            </span>
          )}
          {socketDuelError && (
            <span className="text-red-400">Error: {socketDuelError}</span>
          )}
        </div>
        <div className="mt-1 text-xs text-gray-400">
          Users:{" "}
          {usersInRoom
            .map(
              (u) =>
                `${u.username || u.userId.substring(0, 6)} (${u.role.substring(0, 1).toUpperCase()})`,
            )
            .join(", ") || "Waiting..."}
        </div>
        {ratingsUpdate &&
          assignedRoleAndUser &&
          ratingsUpdate[assignedRoleAndUser.userId] && (
            <p className="text-sm mt-1 text-gray-300">
              Rating: {ratingsUpdate[assignedRoleAndUser.userId].oldRating} →{" "}
              <span className="font-bold text-lg text-sky-300">
                {ratingsUpdate[assignedRoleAndUser.userId].newRating}
              </span>{" "}
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
        className={`flex-grow grid ${isSpectator ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1 md:grid-cols-2"} gap-3 overflow-hidden`}
      >
        <div
          className={`${isSpectator ? "lg:col-span-1" : "md:col-span-1"} flex flex-col gap-3`}
        >
          <div className="card bg-gray-800/80 p-3.5 rounded-lg shadow-xl overflow-y-auto flex-grow min-h-[200px] prose prose-sm max-w-none">
            {problemToDisplay ? (
              <>
                <h2 className="text-xl font-semibold !text-green-400 !mt-0 !mb-2.5">
                  {problemToDisplay.title}
                </h2>
                <div
                  dangerouslySetInnerHTML={{
                    __html: problemToDisplay.description,
                  }}
                />
                {problemToDisplay.platform === "leetcode" &&
                  problemToDisplay.metaData && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-gray-500 hover:text-gray-300">
                        View MetaData
                      </summary>
                      <pre className="!bg-gray-900/70 !text-xs">
                        {JSON.stringify(
                          JSON.parse(problemToDisplay.metaData),
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  )}
              </>
            ) : (
              <p className="text-gray-400 p-4 text-center">
                {isLoadingAuth && !assignedRoleAndUser
                  ? "Initializing..."
                  : "Waiting for problem assignment..."}
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
                  isLocal
                />
              )}
              {isCompetitor && opponentData && (
                <VideoPlayer
                  stream={rtcPeer1.remoteStream}
                  label={`${opponentData.username || "Opponent"}`}
                />
              )}
              {isCompetitor && !opponentData && (
                <div className="aspect-video bg-gray-800 rounded-lg flex flex-col items-center justify-center text-gray-500 shadow-md">
                  <VideoOff size={24} className="mb-1" />
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
                <div className="aspect-video bg-gray-800 rounded-lg flex flex-col items-center justify-center text-gray-500 shadow-md">
                  <VideoOff size={24} className="mb-1" />
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
                <div className="aspect-video bg-gray-800 rounded-lg flex flex-col items-center justify-center text-gray-500 shadow-md">
                  <VideoOff size={24} className="mb-1" />
                  C2 Offline
                </div>
              )}
            </div>
          )}
        </div>

        <div
          className={`${isSpectator ? "lg:col-span-2" : "md:col-span-1"} grid ${isSpectator ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"} gap-3 overflow-hidden`}
        >
          {isMyEditorActive && (
            <div className="card flex flex-col h-full bg-gray-800/80 p-3.5 rounded-lg shadow-xl">
              <div className="flex justify-between items-center mb-2.5">
                <h2 className="text-lg font-semibold text-sky-300 flex items-center">
                  <UserCircle2 size={20} className="mr-2" />
                  Your Editor ({assignedRoleAndUser?.role})
                </h2>
                <select
                  value={myLanguage}
                  onChange={(e) => handleMyLanguageChange(e.target.value)}
                  className="p-1.5 bg-gray-700 rounded text-white border border-gray-600 text-xs focus:ring-sky-500 focus:border-sky-500"
                >
                  {(
                    Object.keys(languageDisplayName) as SupportedLanguage[]
                  ).map((langKey) => (
                    <option key={langKey} value={langKey}>
                      {languageDisplayName[langKey]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-grow min-h-[300px] md:min-h-[calc(100%-120px)] border border-gray-700 rounded-md overflow-hidden">
                <CodeEditor
                  language={myLanguage}
                  value={myCode}
                  onChange={handleMyCodeChange}
                />
              </div>
              {problemToDisplay && (
                <button
                  onClick={handleSubmitSolution}
                  className="btn btn-success w-full mt-3 flex items-center justify-center"
                  disabled={
                    isSubmitting ||
                    !problemToDisplay?.tests?.length ||
                    duelRoomState?.status === "finished"
                  }
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <Send size={18} className="mr-2" />
                  )}
                  {isSubmitting
                    ? "Submitting..."
                    : duelRoomState?.status === "finished"
                      ? duelRoomState.winner === authenticatedUser?.id
                        ? "You Won!"
                        : duelRoomState.winner
                          ? "Duel Over"
                          : "Submit Solution"
                      : "Submit Solution"}
                </button>
              )}
            </div>
          )}
          {isSpectator && (
            <>
              {[competitor1Data, competitor2Data].map((competitor, index) => (
                <div
                  key={index}
                  className="card flex flex-col h-full bg-gray-800/80 p-3.5 rounded-lg shadow-xl"
                >
                  <h2 className="text-lg font-semibold mb-2.5 text-gray-300 flex items-center">
                    <Eye size={20} className="mr-2 text-sky-400" />C{index + 1}:{" "}
                    {competitor?.username || "N/A"}
                  </h2>
                  {competitor ? (
                    <>
                      <div className="flex-grow min-h-[300px] md:min-h-0 border border-gray-700 rounded-md overflow-hidden bg-gray-850">
                        <CodeEditor
                          language={
                            (competitor.language as SupportedLanguage) ||
                            "plaintext"
                          }
                          value={competitor.code || ""}
                          onChange={() => {}}
                        />
                      </div>
                      <p className="text-xs p-1.5 bg-gray-700/70 mt-1.5 rounded-md">
                        Lang:{" "}
                        {languageDisplayName[
                          competitor.language as SupportedLanguage
                        ] || "N/A"}
                      </p>
                    </>
                  ) : (
                    <div className="flex-grow flex items-center justify-center text-gray-500 text-sm">
                      Waiting for Competitor {index + 1}...
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
          {!isMyEditorActive &&
            !isSpectator &&
            authenticatedUser &&
            duelIdFromParams && (
              <div className="flex items-center justify-center text-gray-400 md:col-span-1 p-10 text-center">
                <Loader2 className="h-8 w-8 animate-spin mr-3 text-sky-400" />{" "}
                Attempting to join duel as competitor... ensure you are logged
                in.
              </div>
            )}
        </div>
      </div>
      {submissionResult && (
        <div className="fixed bottom-0 left-0 right-0 p-3 md:p-4 bg-gray-700/95 backdrop-blur-sm border-t-2 border-gray-600 shadow-2xl max-h-48 md:max-h-64 overflow-y-auto z-[60]">
          <button
            onClick={() => setSubmissionResult(null)}
            className="absolute top-2 right-3 text-gray-400 hover:text-white text-3xl font-thin leading-none"
            aria-label="Close submission panel"
          >
            <XCircle size={20} />
          </button>
          <h3
            className={`text-lg font-semibold mb-2 ${submissionResult.passed ? "text-green-400" : "text-red-400"}`}
          >
            Submission:{" "}
            {submissionResult.passed
              ? "All Tests Passed!"
              : "Some Tests Failed"}
          </h3>
          <div className="space-y-1">
            {submissionResult.details.map((detail) => (
              <div
                key={detail.index}
                className={`p-1.5 text-xs rounded ${detail.status === "Accepted" ? "bg-green-800/70" : "bg-red-800/70"}`}
              >
                <p>
                  Test {detail.index + 1}: {detail.status} (Time:{" "}
                  {detail.time?.toFixed(3) ?? "N/A"}s, Mem:{" "}
                  {detail.memory ?? "N/A"}KB)
                </p>
                {detail.stderr && (
                  <pre className="text-red-200 bg-black/50 p-1 mt-1 rounded whitespace-pre-wrap max-h-20 overflow-y-auto text-[0.65rem] leading-tight">
                    Stderr: {detail.stderr}
                  </pre>
                )}
                {detail.stdout && detail.status !== "Accepted" && (
                  <pre className="text-yellow-200 bg-black/50 p-1 mt-1 rounded whitespace-pre-wrap max-h-20 overflow-y-auto text-[0.65rem] leading-tight">
                    Stdout: {detail.stdout}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {duelRoomState?.status === "finished" && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] backdrop-blur-sm p-4">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl text-center max-w-md w-full border-2 border-sky-600">
            <Trophy
              size={56}
              className="text-yellow-400 mx-auto mb-5 animate-bounce"
            />
            <h2 className="text-4xl font-bold mb-4 text-gray-100">
              Duel Finished!
            </h2>
            {duelRoomState.winner ? (
              <p className="text-2xl mb-2">
                Winner:{" "}
                <span className="text-green-400 font-bold">
                  {usersInRoom.find((u) => u.userId === duelRoomState.winner)
                    ?.username || duelRoomState.winner}
                </span>
              </p>
            ) : (
              <p className="text-2xl mb-2">It's a Draw!</p>
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
              className="btn btn-primary mt-8 text-lg w-full md:w-auto"
            >
              Find New Duel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
