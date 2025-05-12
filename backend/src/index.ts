import dotenv from "dotenv";
import { ApolloServer, gql } from "apollo-server";
import fetch, { Response as FetchResponse } from "node-fetch"; // Import FetchResponse for typing

dotenv.config();

const JUDGE0_URL =
  process.env.JUDGE0_URL ||
  `http://localhost:${process.env.JUDGE0_PORT || "2358"}`;
const JUDGE0_KEY = process.env.JUDGE0_SECRET!;
const LANGUAGE_IDS: Record<string, number> = {
  cpp: 54, // C++ (GCC 9.2.0)
  java: 62, // Java (OpenJDK 13.0.1)
  python: 71, // Python (3.8.1)
};

interface TsTestCase {
  stdin: string;
  expected: string;
}

interface TsProblem {
  id: string;
  title: string;
  description: string;
  tests: TsTestCase[];
}

interface TsLeetProblemStub {
  title: string;
  titleSlug: string;
}

const cache: {
  leetProblemStubs?: TsLeetProblemStub[];
  cfProblems?: TsProblem[];
} = {};

interface TsTestCaseInput {
  stdin: string;
  expected: string;
}

interface TsJudgeInput {
  code: string;
  lang: string;
  tests: TsTestCaseInput[];
}

interface Judge0Status {
  id: number;
  description: string;
}

interface Judge0SubmissionResult {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
  status?: Judge0Status; // Optional
  token: string;
}

const typeDefs = gql`
  type Query {
    randomProblem(platform: String!): Problem!
  }

  type Mutation {
    judgeSubmission(input: JudgeInput!): JudgeResult!
  }

  type Problem {
    id: ID!
    title: String!
    description: String!
    tests: [TestCase!]!
  }

  type TestCase {
    stdin: String!
    expected: String!
  }

  input JudgeInput {
    code: String!
    lang: String!
    tests: [TestCaseInput!]!
  }

  input TestCaseInput {
    stdin: String!
    expected: String!
  }

  type JudgeResult {
    passed: Boolean!
    details: [TestDetail!]!
  }

  type TestDetail {
    index: Int!
    status: String!
    stdout: String
    stderr: String
    time: Float
    memory: Int
  }
`;

async function fetchLeetProblemStubs(): Promise<TsLeetProblemStub[]> {
  if (cache.leetProblemStubs) {
    return cache.leetProblemStubs;
  }
  const leetCodeGraphQLQuery = `
    query problemsetQuestionListV2($categorySlug: String, $limit: Int, $skip: Int) {
      problemsetQuestionListV2(categorySlug: $categorySlug, limit: $limit, skip: $skip) {
        questions { title titleSlug }
      }
    }`;
  const variables = { categorySlug: "", limit: 100, skip: 0 };
  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://leetcode.com/",
    },
    body: JSON.stringify({ query: leetCodeGraphQLQuery, variables }),
  });
  if (!res.ok) {
    const errorBody = await res.text();
    console.error("LeetCode API stubs failed:", res.status, errorBody);
    throw new Error(`Failed to fetch stubs from LeetCode: ${res.status}`);
  }
  const json = (await res.json()) as {
    data?: {
      problemsetQuestionListV2?: {
        questions: Array<{ title: string; titleSlug: string }>;
      };
    };
  };
  const questionsData = json.data?.problemsetQuestionListV2?.questions;
  if (!questionsData) {
    console.error("Unexpected LeetCode API stub structure:", json);
    cache.leetProblemStubs = [];
    return [];
  }
  const stubs: TsLeetProblemStub[] = questionsData.map((q) => ({
    title: q.title,
    titleSlug: q.titleSlug,
  }));
  cache.leetProblemStubs = stubs;
  return stubs;
}

async function fetchLeetProblemDetails(titleSlug: string): Promise<TsProblem> {
  const leetCodeQuestionDetailQuery = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) { title titleSlug content sampleTestCase exampleTestcases }
    }`;
  const variables = { titleSlug };
  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://leetcode.com/",
    },
    body: JSON.stringify({ query: leetCodeQuestionDetailQuery, variables }),
  });
  if (!res.ok) {
    const errorBody = await res.text();
    console.error(
      `LeetCode details (${titleSlug}) failed:`,
      res.status,
      errorBody,
    );
    throw new Error(
      `Failed to fetch details from LeetCode for ${titleSlug}: ${res.status}`,
    );
  }
  const json = (await res.json()) as {
    data?: {
      question?: {
        title: string;
        titleSlug: string;
        content: string | null;
        sampleTestCase: string | null;
        exampleTestcases: string | null;
      };
    };
  };
  const questionData = json.data?.question;
  if (!questionData) {
    console.error(`Unexpected LeetCode detail structure (${titleSlug}):`, json);
    throw new Error(
      `Could not retrieve details for LeetCode problem: ${titleSlug}`,
    );
  }
  const tests: TsTestCase[] = [];
  const testCaseStr =
    questionData.sampleTestCase || questionData.exampleTestcases;
  if (testCaseStr) {
    const lines = testCaseStr.split(/\r?\n/).filter(Boolean);
    for (let i = 0; i + 1 < lines.length; i += 2) {
      tests.push({
        stdin: lines[i].replace(/^Input:\s*/i, "").trim(),
        expected: lines[i + 1].replace(/^Output:\s*/i, "").trim(),
      });
    }
  } else {
    console.warn(`No sample tests for LeetCode problem: ${titleSlug}`);
  }
  return {
    id: questionData.titleSlug,
    title: questionData.title,
    description: questionData.content || "No description.",
    tests,
  };
}

async function fetchCFProblems(): Promise<TsProblem[]> {
  if (cache.cfProblems) return cache.cfProblems;
  const res = await fetch("https://codeforces.com/api/problemset.problems");
  if (!res.ok) {
    console.error("Codeforces API failed:", res.status, await res.text());
    throw new Error(`Failed to fetch from Codeforces: ${res.status}`);
  }
  const json = (await res.json()) as {
    status: string;
    result?: {
      problems: Array<{
        contestId: number;
        index: string;
        name: string;
        tags: string[];
      }>;
    };
  };
  if (json.status !== "OK" || !json.result) {
    console.error("Codeforces API error:", json);
    cache.cfProblems = [];
    return [];
  }
  const problems: TsProblem[] = json.result.problems.map((p) => ({
    id: `${p.contestId}${p.index}`,
    title: p.name,
    description: `CF Problem: ${p.contestId}${p.index}. Tags: ${p.tags.join(", ")}. (No full description/tests from this API).`,
    tests: [],
  }));
  cache.cfProblems = problems;
  return problems;
}

async function runJudge0Batch(
  tests: TsTestCaseInput[],
  code: string,
  lang: string,
): Promise<Judge0SubmissionResult[]> {
  const languageId = LANGUAGE_IDS[lang.toLowerCase()];
  if (languageId === undefined) {
    throw new Error(
      `Unsupported language: ${lang}. Supported: ${Object.keys(LANGUAGE_IDS).join(", ")}`,
    );
  }

  const submissionsPayload = tests.map((t) => ({
    source_code: code,
    language_id: languageId,
    stdin: t.stdin,
    expected_output: t.expected,
    cpu_time_limit: 2,
    memory_limit: 128000,
  }));

  const initialResp: FetchResponse = await fetch(
    `${JUDGE0_URL}/submissions/batch?base64_encoded=false`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(JUDGE0_KEY && { "X-Auth-Token": JUDGE0_KEY }),
      },
      body: JSON.stringify({ submissions: submissionsPayload }),
    },
  );

  if (!initialResp.ok) {
    const errorBody = await initialResp.text();
    console.error(
      "Judge0 initial batch submission request failed:",
      initialResp.status,
      errorBody,
    );
    throw new Error(
      `Judge0 initial batch submission request failed: ${initialResp.status} - ${errorBody}`,
    );
  }

  type TokenResponseItem =
    | { token: string }
    | { error?: any; [key: string]: any };
  const tokenResponses = (await initialResp.json()) as Array<TokenResponseItem>;
  // console.log("Judge0 initial token responses:", JSON.stringify(tokenResponses, null, 2));

  const tokensToPoll: string[] = [];
  const initialErrorResultsMap: Map<number, Judge0SubmissionResult> = new Map();

  tokenResponses.forEach((tr, index) => {
    if ("token" in tr && tr.token) {
      tokensToPoll.push(tr.token);
    } else {
      console.error(
        `Error creating submission for batch item index ${index}:`,
        tr,
      );
      let errorMessage = "Batch submission creation failed";
      const potentialError = (tr as { error?: any }).error;

      if (potentialError && typeof potentialError === "string") {
        errorMessage = potentialError;
      } else if (
        potentialError &&
        typeof potentialError === "object" &&
        potentialError !== null
      ) {
        errorMessage = JSON.stringify(potentialError);
      } else if (Object.keys(tr).length > 0 && !("token" in tr)) {
        errorMessage = `Invalid submission parameters: ${JSON.stringify(tr)}`;
      }

      initialErrorResultsMap.set(index, {
        token: `batch_creation_error_${index}`,
        status: { id: -20, description: "Batch Creation Error" },
        stdout: null,
        stderr: errorMessage,
        compile_output: null,
        message: errorMessage,
        time: null,
        memory: null,
      });
    }
  });

  const resultsPromises = tokensToPoll.map(async (token) => {
    let attempts = 0;
    const maxAttempts = 20;
    const pollInterval = 1000;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const pollResp: FetchResponse = await fetch(
        `${JUDGE0_URL}/submissions/${token}?base64_encoded=false&fields=*`,
        {
          method: "GET",
          headers: { ...(JUDGE0_KEY && { "X-Auth-Token": JUDGE0_KEY }) },
        },
      );

      if (!pollResp.ok) {
        const errorBody = await pollResp.text();
        console.error(
          `Judge0 poll for token ${token} failed:`,
          pollResp.status,
          errorBody,
        );
        return {
          token: token,
          status: {
            id: -1,
            description: `Polling HTTP Error: ${pollResp.status}`,
          },
          stdout: null,
          stderr: errorBody,
          compile_output: null,
          message: `Polling HTTP Error: ${pollResp.status}`,
          time: null,
          memory: null,
        } as Judge0SubmissionResult;
      }

      const result = (await pollResp.json()) as Judge0SubmissionResult;
      if (result.status && result.status.id > 2) {
        return result;
      } else if (
        result.status &&
        (result.status.id === 1 || result.status.id === 2)
      ) {
        // Still processing
      } else {
        console.warn(
          `Unexpected polling status/structure for token ${token}. Assuming finished or error. Result:`,
          result,
        );
        return {
          ...result,
          token: token,
          status: result.status || {
            id: -2,
            description: "Unknown Polling Outcome",
          },
        } as Judge0SubmissionResult;
      }
      attempts++;
    }

    console.warn(`Max polling attempts reached for token ${token}.`);
    return {
      token: token,
      status: { id: -3, description: "Polling Timeout" },
      stdout: null,
      stderr: "Max polling attempts reached",
      compile_output: null,
      message: "Polling Timeout",
      time: null,
      memory: null,
    } as Judge0SubmissionResult;
  });

  const polledResults = await Promise.all(resultsPromises);

  const finalResults: Judge0SubmissionResult[] = [];
  let polledIdx = 0;
  for (let i = 0; i < tokenResponses.length; i++) {
    if (initialErrorResultsMap.has(i)) {
      finalResults.push(initialErrorResultsMap.get(i)!);
    } else {
      // This was a submission for which we got a token and polled
      // Ensure we match the polled result correctly, assuming polledResults are in the same order as tokensToPoll
      if (polledIdx < polledResults.length) {
        finalResults.push(polledResults[polledIdx]);
        polledIdx++;
      } else {
        // Should not happen if logic is correct, implies a token was in tokensToPoll but no result in polledResults
        console.error(
          `Mismatch: No polled result for token that should have been polled (original index ${i})`,
        );
        finalResults.push({
          token: `missing_polled_result_for_original_index_${i}`,
          status: { id: -98, description: "Internal Polling Result Missing" },
          stdout: null,
          stderr: "Missing polled result",
          compile_output: null,
          message: null,
          time: null,
          memory: null,
        });
      }
    }
  }
  return finalResults;
}

const resolvers = {
  Query: {
    randomProblem: async (
      _source: unknown,
      args: { platform: string },
    ): Promise<TsProblem> => {
      if (args.platform.toLowerCase() === "leetcode") {
        const stubs = await fetchLeetProblemStubs();
        if (stubs.length === 0) throw new Error("No LeetCode stubs.");
        const randomStub = stubs[Math.floor(Math.random() * stubs.length)];
        return fetchLeetProblemDetails(randomStub.titleSlug);
      } else if (args.platform.toLowerCase() === "codeforces") {
        const arr = await fetchCFProblems();
        if (arr.length === 0) throw new Error("No Codeforces problems.");
        return arr[Math.floor(Math.random() * arr.length)];
      } else {
        throw new Error(
          'Unsupported platform. Choose "leetcode" or "codeforces".',
        );
      }
    },
  },
  Mutation: {
    judgeSubmission: async (
      _source: unknown,
      args: { input: TsJudgeInput },
    ): Promise<{ passed: boolean; details: any[] }> => {
      const { code, lang, tests } = args.input;
      if (!tests || tests.length === 0) {
        throw new Error("No test cases provided.");
      }

      const rawResults = await runJudge0Batch(tests, code, lang);
      console.log(
        "Judge0 Final Raw Results (after polling):",
        JSON.stringify(rawResults, null, 2),
      );

      const details = rawResults.map((r: Judge0SubmissionResult, i: number) => {
        let statusText = "Processing Error";

        if (r && r.compile_output) {
          statusText = "Compilation Error";
        } else if (r && r.status && r.status.description) {
          statusText = r.status.description;
        } else if (r && r.message) {
          statusText = r.message;
        } else if (r && r.stderr && !r.status) {
          statusText = "Runtime Error (see stderr)";
        } else if (!r.status) {
          statusText = "Error: Status Invalid/Missing";
        }

        let finalStderr = r.stderr;
        if (statusText === "Compilation Error" && r.compile_output) {
          finalStderr = r.compile_output;
        }

        return {
          index: i,
          status: statusText,
          stdout: r.stdout,
          stderr: finalStderr,
          time: r.time ? parseFloat(r.time) : null,
          memory: r.memory,
        };
      });

      const passed = details.every((d) => d.status === "Accepted");
      return { passed, details };
    },
  },
};

const server = new ApolloServer({ typeDefs, resolvers });
const port = process.env.PORT || 4000;
server.listen({ port }).then(({ url }: { url: string }) => {
  console.log(`🚀 GraphQL server ready at ${url}`);
  console.log(`Judge0 API URL: ${JUDGE0_URL}`);
});
