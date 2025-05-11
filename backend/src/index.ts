import dotenv from "dotenv";
import { ApolloServer, gql } from "apollo-server";
import fetch from "node-fetch";

dotenv.config();

const JUDGE0_URL =
  process.env.JUDGE0_URL ||
  `http://localhost:${process.env.JUDGE0_PORT || "3000"}`; // Default Judge0 port is 2358
const JUDGE0_KEY = process.env.JUDGE0_SECRET!;
const LANGUAGE_IDS: Record<string, number> = {
  cpp: 54,
  java: 62,
  python: 71,
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

const cache: {
  leetProblems?: TsProblem[];
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
  time: string | null; // Judge0 returns time as string, e.g., "0.002"
  memory: number | null; // Judge0 returns memory in KB
  status: Judge0Status;
  token: string;
  // Other fields like wall_time, exit_code, exit_signal might also be present
}

// GraphQL schema definition
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
    lang: String! # e.g., "cpp", "java", "python"
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
    time: Float # Will be derived from Judge0 string time
    memory: Int # Will be Judge0 memory in KB
  }
`;

/**
 * Fetch problems and sample tests from LeetCode
 */
async function fetchLeetProblems(): Promise<TsProblem[]> {
  if (cache.leetProblems) return cache.leetProblems;

  // This is the GraphQL query string for LeetCode API
  const leetCodeGraphQLQuery = `
    query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
      problemsetQuestionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
        questions: data {
          titleSlug
          title
          content
          sampleTestCase
        }
      }
    }`;

  const variables = { categorySlug: "", limit: 50, skip: 0, filters: {} }; // Example variables

  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://leetcode.com/", // LeetCode might require a referer or other headers
    },
    body: JSON.stringify({ query: leetCodeGraphQLQuery, variables }),
  });

  if (!res.ok) {
    console.error("LeetCode API request failed:", res.status, await res.text());
    throw new Error(`Failed to fetch from LeetCode: ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: {
      problemsetQuestionList?: {
        questions: Array<{
          titleSlug: string;
          title: string;
          content: string;
          sampleTestCase: string;
        }>;
      };
    };
  };

  // Added more robust error handling for LeetCode response structure
  const questions = json.data?.problemsetQuestionList?.questions;
  if (!questions) {
    console.error("Unexpected LeetCode API response structure:", json);
    cache.leetProblems = []; // Cache empty result to prevent re-fetch on immediate error
    return [];
  }

  const problems: TsProblem[] = questions.map((q) => {
    const lines = q.sampleTestCase
      ? q.sampleTestCase.split(/\r?\n/).filter(Boolean)
      : [];
    const tests: TsTestCase[] = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
      // Basic parsing, might need adjustment based on actual sampleTestCase variations
      tests.push({
        stdin: lines[i].replace(/^Input:\s*/i, "").trim(),
        expected: lines[i + 1].replace(/^Output:\s*/i, "").trim(),
      });
    }
    return {
      id: q.titleSlug,
      title: q.title,
      description: q.content || "",
      tests,
    };
  });
  cache.leetProblems = problems;
  return problems;
}

/**
 * Fetch problems and sample tests from Codeforces
 */
async function fetchCFProblems(): Promise<TsProblem[]> {
  if (cache.cfProblems) return cache.cfProblems;
  const res = await fetch("https://codeforces.com/api/problemset.problems");
  if (!res.ok) {
    console.error(
      "Codeforces API request failed:",
      res.status,
      await res.text(),
    );
    throw new Error(`Failed to fetch from Codeforces: ${res.status}`);
  }
  const json = (await res.json()) as {
    status: string;
    result?: {
      // Made result optional for safety
      problems: Array<{
        contestId: number;
        index: string;
        name: string;
        tags: string[];
      }>; // statement is not directly available here, full problem parsing is complex
      problemStatistics: Array<any>; // Not used here, but part of the response
    };
  };

  if (json.status !== "OK" || !json.result) {
    console.error("Codeforces API error or unexpected structure:", json);
    cache.cfProblems = [];
    return [];
  }

  const questions = json.result.problems;
  // Note: Codeforces problemset.problems API does NOT return sample tests or full statements directly.
  // You'd typically need to scrape individual problem pages for that, which is much more complex.
  // For this example, we'll create problems with empty descriptions and tests.
  const problems: TsProblem[] = questions.map((p) => ({
    id: `${p.contestId}${p.index}`,
    title: p.name,
    description: `Problem from Codeforces: ${p.contestId}${p.index}. Tags: ${p.tags.join(", ")}. (Full description and tests require scraping)`,
    tests: [], // Sample tests are not in this API endpoint
  }));
  cache.cfProblems = problems;
  return problems;
}

/**
 * Submit test cases to Judge0 in batch mode
 */
async function runJudge0Batch(
  tests: TsTestCaseInput[],
  code: string,
  lang: string,
): Promise<Judge0SubmissionResult[]> {
  const languageId = LANGUAGE_IDS[lang.toLowerCase()];
  if (languageId === undefined) {
    // Consider throwing a UserInputError for GraphQL
    throw new Error(
      `Unsupported language: ${lang}. Supported languages are: ${Object.keys(LANGUAGE_IDS).join(", ")}`,
    );
  }

  const submissions = tests.map((t) => ({
    source_code: code,
    language_id: languageId,
    stdin: t.stdin,
    expected_output: t.expected, // Judge0 uses expected_output for comparison
  }));

  const resp = await fetch(
    `${JUDGE0_URL}/submissions/batch?base64_encoded=false&wait=true`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Judge0 CE v0.7.0+ uses 'X-Auth-Token' for RAPID API KEY if configured
        // For self-hosted Judge0 instances, API key might not be needed or might be different.
        // 'X-Judge0-User': 'YOUR_JUDGE0_USER_HEADER_IF_NEEDED'
        ...(JUDGE0_KEY && { "X-Auth-Token": JUDGE0_KEY }), // Only add if JUDGE0_KEY is set
      },
      body: JSON.stringify({ submissions }),
    },
  );

  if (!resp.ok) {
    const errorBody = await resp.text();
    console.error("Judge0 API request failed:", resp.status, errorBody);
    throw new Error(`Judge0 submission failed: ${resp.status} - ${errorBody}`);
  }

  // Judge0 batch response is directly an array of submission results when wait=true
  const results = (await resp.json()) as Judge0SubmissionResult[];
  return results;
}

// GraphQL resolvers
const resolvers = {
  Query: {
    randomProblem: async (
      _: unknown,
      args: { platform: string },
    ): Promise<TsProblem> => {
      let arr: TsProblem[];
      if (args.platform.toLowerCase() === "leetcode") {
        arr = await fetchLeetProblems();
      } else if (args.platform.toLowerCase() === "codeforces") {
        arr = await fetchCFProblems();
      } else {
        throw new Error(
          'Unsupported platform. Choose "leetcode" or "codeforces".',
        );
      }
      if (arr.length === 0) {
        throw new Error(
          `No problems fetched from ${args.platform} or platform is temporarily unavailable.`,
        );
      }
      return arr[Math.floor(Math.random() * arr.length)];
    },
  },
  Mutation: {
    judgeSubmission: async (_: unknown, args: { input: TsJudgeInput }) => {
      const { code, lang, tests } = args.input;
      if (!tests || tests.length === 0) {
        throw new Error("No test cases provided for submission.");
      }

      const rawResults = await runJudge0Batch(tests, code, lang);

      const details = rawResults.map(
        (r: Judge0SubmissionResult, i: number) => ({
          index: i,
          status: r.status.description,
          stdout: r.stdout,
          stderr: r.stderr,
          time: r.time ? parseFloat(r.time) : null, // Convert string time to Float
          memory: r.memory, // Memory is already a number (in KB)
        }),
      );

      const passed = details.every((d) => d.status === "Accepted");
      return { passed, details };
    },
  },
};

// Initialize Apollo Server
const server = new ApolloServer({ typeDefs, resolvers });

const port = process.env.PORT || 4000;
server.listen({ port }).then(({ url }: { url: string }) => {
  console.log(`🚀 GraphQL server ready at ${url}`);
  console.log(`Judge0 API URL: ${JUDGE0_URL}`);
});
