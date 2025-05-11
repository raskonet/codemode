import React, { useState, useEffect } from "react";
import { gql, useQuery, useMutation, ApolloError } from "@apollo/client";
import CodeEditor from "./components/Editor";

// GraphQL Queries and Mutations
const GET_RANDOM_PROBLEM = gql`
  query RandomProblem($platform: String!) {
    randomProblem(platform: $platform) {
      id
      title
      description
      tests {
        stdin
        expected
      }
    }
  }
`;

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

// TypeScript Interfaces
interface TestCase {
  stdin: string;
  expected: string;
}

interface Problem {
  id: string;
  title: string;
  description: string;
  tests: TestCase[];
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

type SupportedLanguage = "cpp" | "java" | "python";
const DEFAULT_LANGUAGE: SupportedLanguage = "cpp";
const DEFAULT_PLATFORM = "leetcode";

const languageDisplayName: Record<SupportedLanguage, string> = {
  cpp: "C++",
  java: "Java",
  python: "Python",
};

const initialCodeSamples: Record<SupportedLanguage, string> = {
  cpp: `#include <iostream>
#include <vector>
#include <string>

// Standard boilerplate, adjust as needed for competitive programming
// For example, use std::ios_base::sync_with_stdio(false); std::cin.tie(NULL); for faster I/O

int main() {
    // Read input
    // Your logic here
    // Print output
    std::cout << "Hello World from C++" << std::endl;
    return 0;
}`,
  java: `import java.util.*;
import java.io.*;

// Standard boilerplate, adjust as needed
// class Main is often required for online judges
public class Main {
    public static void main(String[] args) {
        // Scanner sc = new Scanner(System.in);
        // Your logic here
        System.out.println("Hello World from Java");
    }
}`,
  python: `# Standard boilerplate, adjust as needed
# import sys
# input = sys.stdin.readline

def solve():
    # Read input
    # Your logic here
    print("Hello World from Python")

if __name__ == "__main__":
    solve()
`,
};

export default function App() {
  const [currentPlatform, setCurrentPlatform] =
    useState<string>(DEFAULT_PLATFORM);
  const [currentProblem, setCurrentProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState<string>(
    initialCodeSamples[DEFAULT_LANGUAGE],
  );
  const [language, setLanguage] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [submissionResult, setSubmissionResult] = useState<JudgeResult | null>(
    null,
  );
  const [fetchError, setFetchError] = useState<ApolloError | null | string>(
    null,
  );
  const [submitError, setSubmitError] = useState<ApolloError | null | string>(
    null,
  );

  const {
    loading: isLoadingProblem,
    error: problemError,
    refetch: refetchProblem,
  } = useQuery<{ randomProblem: Problem }>(GET_RANDOM_PROBLEM, {
    variables: { platform: currentPlatform },
    onCompleted: (data) => {
      setCurrentProblem(data.randomProblem);
      setSubmissionResult(null); // Clear previous results
      setFetchError(null);
      // Optionally, set initial code based on problem or keep user's current language choice
      // setCode(initialCodeSamples[language]); // Or some problem-specific template if available
    },
    onError: (error) => {
      console.error("Error fetching problem:", error);
      setFetchError(
        error.message ||
          "Failed to fetch problem. The API might be down or the response was malformed.",
      );
      setCurrentProblem(null);
    },
    notifyOnNetworkStatusChange: true, // Useful if you use networkStatus
    fetchPolicy: "no-cache", // Ensures fresh problem on refetch
  });

  const [
    judgeSubmission,
    { loading: isSubmitting, error: submissionApiError },
  ] = useMutation<{ judgeSubmission: JudgeResult }>(JUDGE_SUBMISSION, {
    onCompleted: (data) => {
      setSubmissionResult(data.judgeSubmission);
      setSubmitError(null);
    },
    onError: (error) => {
      console.error("Error submitting solution:", error);
      setSubmitError(error.message || "Failed to submit solution.");
      setSubmissionResult(null);
    },
  });

  useEffect(() => {
    setCode(initialCodeSamples[language]);
    setSubmissionResult(null); // Clear results when language changes
  }, [language]);

  useEffect(() => {
    if (problemError) {
      setFetchError(
        problemError.message ||
          "Failed to fetch problem. Please try a different platform or try again later.",
      );
    }
  }, [problemError]);

  useEffect(() => {
    if (submissionApiError) {
      setSubmitError(
        submissionApiError.message ||
          "Submission failed. Please check your code or try again.",
      );
    }
  }, [submissionApiError]);

  const handleFetchProblem = (platform: string) => {
    setCurrentPlatform(platform);
    // refetchProblem will be called automatically if variables change,
    // but explicit refetch is clearer if platform is already current one.
    // For simplicity, we rely on variable change or direct call if needed.
    // If currentPlatform is already 'platform', we might need to force it
    setFetchError(null);
    setSubmissionResult(null);
    if (currentPlatform === platform) {
      refetchProblem({ platform });
    } else {
      setCurrentPlatform(platform); // This will trigger useQuery refetch due to variable change
    }
  };

  const handleSubmit = () => {
    if (!currentProblem) {
      alert("Please fetch a problem first.");
      return;
    }
    if (currentProblem.tests.length === 0) {
      alert(
        "This problem has no sample test cases to judge against. Cannot submit.",
      );
      return;
    }
    setSubmitError(null);
    setSubmissionResult(null); // Clear previous results
    judgeSubmission({
      variables: {
        input: {
          code,
          lang: language,
          tests: currentProblem.tests.map(({ stdin, expected }) => ({
            stdin,
            expected,
          })), // Ensure tests are in the correct format for JudgeInput
        },
      },
    });
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-800 text-white">
      {/* Problem Panel */}
      <div className="w-full md:w-2/5 h-1/2 md:h-full p-4 overflow-y-auto border-r border-gray-700">
        <h1 className="text-2xl font-bold mb-4 text-sky-400">
          Coding Dual Arena
        </h1>
        <div className="mb-4 flex space-x-2">
          <button
            onClick={() => handleFetchProblem("leetcode")}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded disabled:opacity-50"
            disabled={isLoadingProblem}
          >
            {isLoadingProblem && currentPlatform === "leetcode"
              ? "Loading..."
              : "New LeetCode Problem"}
          </button>
          <button
            onClick={() => handleFetchProblem("codeforces")}
            className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded disabled:opacity-50"
            disabled={isLoadingProblem}
          >
            {isLoadingProblem && currentPlatform === "codeforces"
              ? "Loading..."
              : "New Codeforces Problem"}
          </button>
        </div>

        {isLoadingProblem && (
          <p className="text-yellow-400">Loading problem...</p>
        )}
        {fetchError && (
          <p className="text-red-400">
            Error:{" "}
            {typeof fetchError === "string" ? fetchError : fetchError.message}
          </p>
        )}

        {currentProblem && (
          <div className="prose prose-sm prose-invert max-w-none">
            {" "}
            {/* prose-invert for dark backgrounds */}
            <h2 className="text-xl font-semibold text-green-400">
              {currentProblem.title}
            </h2>
            <div
              dangerouslySetInnerHTML={{ __html: currentProblem.description }}
            />
            <h3 className="text-lg font-semibold mt-4 mb-2 text-amber-400">
              Sample Test Cases:
            </h3>
            {currentProblem.tests.length > 0 ? (
              currentProblem.tests.map((test, index) => (
                <div key={index} className="mb-3 p-2 bg-gray-700 rounded">
                  <p className="font-mono text-xs">
                    <strong className="text-gray-400">
                      Input {index + 1}:
                    </strong>
                    <br />{" "}
                    <pre className="whitespace-pre-wrap bg-gray-600 p-1 rounded">
                      {test.stdin || '""'}
                    </pre>
                  </p>
                  <p className="font-mono text-xs">
                    <strong className="text-gray-400">
                      Expected Output {index + 1}:
                    </strong>
                    <br />{" "}
                    <pre className="whitespace-pre-wrap bg-gray-600 p-1 rounded">
                      {test.expected || '""'}
                    </pre>
                  </p>
                </div>
              ))
            ) : (
              <p className="text-gray-400 italic">
                No sample tests provided for this problem.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Editor and Submission Panel */}
      <div className="w-full md:w-3/5 h-1/2 md:h-full flex flex-col p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-3">
            <label
              htmlFor="language-select"
              className="text-sm font-medium text-gray-300"
            >
              Language:
            </label>
            <select
              id="language-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
              className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
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
          <button
            onClick={handleSubmit}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded disabled:opacity-50"
            disabled={
              isSubmitting ||
              !currentProblem ||
              isLoadingProblem ||
              currentProblem.tests.length === 0
            }
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </button>
        </div>

        <div className="flex-grow mb-2 min-h-[300px] border border-gray-700 rounded overflow-hidden">
          {" "}
          {/* Ensure editor has space */}
          <CodeEditor language={language} value={code} onChange={setCode} />
        </div>

        {submitError && (
          <p className="text-red-400 mt-2">
            Error:{" "}
            {typeof submitError === "string"
              ? submitError
              : submitError.message}
          </p>
        )}

        {submissionResult && (
          <div className="mt-1 p-3 bg-gray-700 rounded overflow-y-auto max-h-[calc(50vh-120px)] md:max-h-[calc(100vh-450px)]">
            {" "}
            {/* Adjust max-height as needed */}
            <h3
              className={`text-lg font-semibold mb-2 ${submissionResult.passed ? "text-green-400" : "text-red-400"}`}
            >
              Submission Result:{" "}
              {submissionResult.passed
                ? "All Tests Passed!"
                : "Some Tests Failed"}
            </h3>
            {submissionResult.details.map((detail, index) => (
              <div
                key={index}
                className={`mb-2 p-2 rounded ${detail.status === "Accepted" ? "bg-green-800" : "bg-red-800"}`}
              >
                <p className="font-semibold">
                  Test Case {detail.index + 1}:{" "}
                  <span
                    className={`font-bold ${detail.status === "Accepted" ? "text-green-300" : "text-red-300"}`}
                  >
                    {detail.status}
                  </span>
                </p>
                {detail.time !== null && (
                  <p className="text-xs text-gray-300">
                    Time: {detail.time.toFixed(3)}s
                  </p>
                )}
                {detail.memory !== null && (
                  <p className="text-xs text-gray-300">
                    Memory: {detail.memory} KB
                  </p>
                )}
                {detail.status !== "Accepted" && detail.stdout && (
                  <div className="mt-1">
                    <p className="text-xs text-gray-400 font-semibold">
                      Stdout:
                    </p>
                    <pre className="text-xs bg-gray-600 p-1 rounded whitespace-pre-wrap max-h-20 overflow-y-auto">
                      {detail.stdout || "(empty)"}
                    </pre>
                  </div>
                )}
                {detail.status !== "Accepted" && detail.stderr && (
                  <div className="mt-1">
                    <p className="text-xs text-gray-400 font-semibold">
                      Stderr:
                    </p>
                    <pre className="text-xs bg-gray-600 p-1 rounded whitespace-pre-wrap max-h-20 overflow-y-auto">
                      {detail.stderr}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
