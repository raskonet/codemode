// frontend/src/pages/CompetePage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom"; // <<< ENSURE useParams IS HERE
import { gql, useMutation } from "@apollo/client";
import { useAuth } from "../hooks/useAuth";
import {
  useDuelSocket,
  CompetitorRole,
  UserRole,
  Problem as DuelProblemType,
  CompetitorState,
} from "../hooks/useDuelSocket";
import CodeEditor from "../components/Editor";
import { Loader2 } from "lucide-react";

// Types
interface TestCase {
  stdin: string;
  expected: string;
}
interface CodeSnippet {
  lang: string;
  langSlug: string;
  code: string;
}
// DuelProblemType from useDuelSocket hook is sufficient for problem structure here
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

export default function CompetePage() {
  const { duelId: duelIdFromParams } = useParams<{ duelId: string }>(); // This line requires useParams
  const navigate = useNavigate();
  const {
    user: authenticatedUser,
    isAuthenticated,
    isLoadingAuth,
    authError,
  } = useAuth();

  const [userEnteredDuelId, setUserEnteredDuelId] = useState<string>("");

  const {
    isConnected,
    joinDuelRoom,
    sendCodeUpdate,
    sendLanguageUpdate,
    assignedRoleAndUser,
    duelRoomState,
    usersInRoom,
    duelError: socketDuelError,
  } = useDuelSocket(duelIdFromParams);

  const [myCode, setMyCode] = useState<string>("");
  const [myLanguage, setMyLanguage] = useState<SupportedLanguage>("cpp");
  const [submissionResult, setSubmissionResult] = useState<JudgeResult | null>(
    null,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [judgeSubmission, { loading: isSubmitting }] = useMutation<{
    judgeSubmission: JudgeResult;
  }>(JUDGE_SUBMISSION, {
    onCompleted: (data) => {
      setSubmissionResult(data.judgeSubmission);
      setSubmitError(null);
    },
    onError: (error) => {
      setSubmitError(error.message || "Submission failed.");
      setSubmissionResult(null);
    },
  });

  const currentDuelProblem = duelRoomState?.problem;
  const isCompetitor =
    assignedRoleAndUser?.role === "competitor1" ||
    assignedRoleAndUser?.role === "competitor2";
  const isSpectator = assignedRoleAndUser?.role === "spectator";

  useEffect(() => {
    if (
      duelIdFromParams &&
      authenticatedUser &&
      !isLoadingAuth &&
      isConnected
    ) {
      if (
        !assignedRoleAndUser ||
        assignedRoleAndUser.userId !== authenticatedUser.id ||
        assignedRoleAndUser.role === "spectator"
      ) {
        const currentCodeForJoin =
          myCode &&
          !myCode.startsWith("//") &&
          !Object.values(initialCodeSamples).includes(myCode.trim())
            ? myCode
            : initialCodeSamples[myLanguage];
        joinDuelRoom(
          duelIdFromParams,
          authenticatedUser.id,
          authenticatedUser.username,
          currentCodeForJoin,
          myLanguage,
        );
      }
    }
  }, [
    duelIdFromParams,
    authenticatedUser,
    isLoadingAuth,
    isConnected,
    joinDuelRoom,
    assignedRoleAndUser,
    myLanguage,
  ]);

  useEffect(() => {
    if (
      isCompetitor &&
      assignedRoleAndUser &&
      authenticatedUser?.id === assignedRoleAndUser.userId
    ) {
      const myRoleData = duelRoomState?.competitors.find(
        (c) =>
          c.userId === authenticatedUser!.id &&
          c.role === assignedRoleAndUser.role,
      );

      let codeToSet = myRoleData?.code || "";
      const langToSet =
        (myRoleData?.language as SupportedLanguage) || myLanguage;

      const problem = duelRoomState?.problem;
      const isEffectivelyPlaceholder =
        codeToSet === "" ||
        codeToSet.startsWith("//") ||
        Object.values(initialCodeSamples).some(
          (s) => s.trim() === codeToSet.trim(),
        );

      if (isEffectivelyPlaceholder || myCode === "") {
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
      setMyCode(codeToSet); // Set the code
      // Sync language from server if available and different, or set based on langToSet
      if (myRoleData?.language && myLanguage !== myRoleData.language) {
        setMyLanguage(myRoleData.language as SupportedLanguage);
      } else if (
        (!myRoleData?.language || myLanguage !== langToSet) &&
        langToSet
      ) {
        // if server has no lang, or if local differs from determined langToSet
        setMyLanguage(langToSet);
      }
    } else if (!isCompetitor && !isLoadingAuth) {
      // Not a competitor (e.g. spectator or unassigned)
      setMyCode(
        isSpectator
          ? "// Spectator Mode: Viewing Duel"
          : "// Waiting for role assignment or login...",
      );
    }
  }, [
    assignedRoleAndUser,
    duelRoomState,
    authenticatedUser,
    myLanguage,
    isLoadingAuth,
    isCompetitor,
    isSpectator,
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
        authenticatedUser.id,
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
      myCode === "" ||
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
        authenticatedUser.id,
        newLanguage,
        assignedRoleAndUser.role as CompetitorRole,
      );
      if (newCodeToUse !== myCode && isEffectivelyPlaceholder) {
        sendCodeUpdate(
          duelIdFromParams,
          authenticatedUser.id,
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
        <h2 className="text-2xl mb-4">Authentication Required</h2>
        <p className="mb-4">
          Please log in to join or spectate duel{" "}
          <span className="font-semibold text-sky-400">{duelIdFromParams}</span>
          .
        </p>
        <Link
          to={`/login?redirect=/compete/${duelIdFromParams}`}
          className="px-6 py-2 bg-sky-500 hover:bg-sky-600 rounded text-white font-semibold"
        >
          {" "}
          Go to Login{" "}
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
        {authError && !isLoadingAuth && (
          <p className="mb-4 text-red-400 bg-red-900 p-3 rounded">
            {authError}
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
            className="p-3 border rounded-l bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            onClick={handleJoinDuel}
            className="p-3 bg-blue-600 text-white rounded-r hover:bg-blue-700 font-semibold"
          >
            {" "}
            Join / Create{" "}
          </button>
        </div>
        <p className="mt-3 text-sm text-gray-400">
          If the Duel ID doesn't exist, a new room will be created.
        </p>
        {socketDuelError && (
          <p className="mt-4 text-red-400 bg-red-900 p-3 rounded">
            {socketDuelError}
          </p>
        )}
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

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white p-1 md:p-4">
      <header className="mb-2 md:mb-4 px-2">
        <h1 className="text-xl md:text-3xl font-bold">
          Duel Room: <span className="text-sky-400">{duelIdFromParams}</span>
        </h1>
        {isLoadingAuth && (
          <p className="text-sm text-sky-300">Checking auth state...</p>
        )}
        {authenticatedUser && (
          <p className="text-md">
            User: {authenticatedUser.username} (Role:{" "}
            <span className="font-semibold text-yellow-400">
              {assignedRoleAndUser?.role || "Assigning..."}
            </span>
            )
          </p>
        )}
        {!authenticatedUser && !isLoadingAuth && (
          <p className="text-md text-yellow-300">
            Spectating anonymously.{" "}
            <Link to="/login" className="underline">
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
        {authError && (
          <p className="mt-1 text-sm text-red-400 bg-red-800 px-2 py-1 rounded">
            Auth Error: {authError}
          </p>
        )}
        {socketDuelError && (
          <p className="mt-1 text-sm text-red-400 bg-red-800 px-2 py-1 rounded">
            Duel Error: {socketDuelError}
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
      </header>

      <div
        className={`flex-grow grid ${isSpectator ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"} gap-2 md:gap-4 overflow-hidden`}
      >
        <div
          className={`${isSpectator ? "md:col-span-1" : "md:col-span-1"} bg-gray-800 p-3 rounded shadow-lg overflow-y-auto min-h-[200px] md:min-h-0`}
        >
          {problemToDisplay ? (
            <div className="prose prose-sm prose-invert max-w-none">
              <h2 className="text-xl font-semibold text-green-400">
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
                    <summary className="cursor-pointer">View MetaData</summary>
                    <pre>
                      {JSON.stringify(
                        JSON.parse(problemToDisplay.metaData),
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                )}
            </div>
          ) : (
            <p className="text-gray-400">
              {isLoadingAuth && !assignedRoleAndUser
                ? "Initializing..."
                : "Waiting for problem..."}
            </p>
          )}
        </div>

        {isMyEditorActive && (
          <div
            className={`${isSpectator ? "hidden" : "md:col-span-1"} flex flex-col h-full bg-gray-800 p-3 rounded shadow-lg`}
          >
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold">
                Your Editor ({assignedRoleAndUser?.role})
              </h2>
              <select
                value={myLanguage}
                onChange={(e) => handleMyLanguageChange(e.target.value)}
                className="p-2 bg-gray-700 rounded text-white border border-gray-600 text-sm"
              >
                {(Object.keys(languageDisplayName) as SupportedLanguage[]).map(
                  (langKey) => (
                    <option key={langKey} value={langKey}>
                      {languageDisplayName[langKey]}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="flex-grow min-h-[300px] md:min-h-[calc(100%-120px)] border border-gray-700 rounded">
              <CodeEditor
                language={myLanguage}
                value={myCode}
                onChange={handleMyCodeChange}
              />
            </div>
            {problemToDisplay && (
              <button
                onClick={handleSubmitSolution}
                className="mt-3 p-2 w-full bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 font-semibold"
                disabled={isSubmitting || !problemToDisplay?.tests?.length}
              >
                {isSubmitting ? "Submitting..." : "Submit Solution"}
              </button>
            )}
          </div>
        )}

        {isSpectator && (
          <>
            <div className="md:col-span-1 flex flex-col h-full bg-gray-800 p-3 rounded shadow-lg">
              <h2 className="text-lg font-semibold mb-2">
                C1:{" "}
                {competitor1Data?.username ||
                  competitor1Data?.userId.substring(0, 8) ||
                  "N/A"}
              </h2>
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
                  Waiting for Competitor 1...
                </div>
              )}
            </div>
            <div className="md:col-span-1 flex flex-col h-full bg-gray-800 p-3 rounded shadow-lg">
              <h2 className="text-lg font-semibold mb-2">
                C2:{" "}
                {competitor2Data?.username ||
                  competitor2Data?.userId.substring(0, 8) ||
                  "N/A"}
              </h2>
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
                  Waiting for Competitor 2...
                </div>
              )}
            </div>
          </>
        )}
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
    </div>
  );
}
