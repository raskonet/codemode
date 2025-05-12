import dotenv from "dotenv";
import { ApolloServer, gql } from "apollo-server";
import fetch from "node-fetch";

dotenv.config();

const JUDGE0_URL =
  process.env.JUDGE0_URL ||
  `http://localhost:${process.env.JUDGE0_PORT || "2358"}`; // Default Judge0 port
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
  id: string; // Will be titleSlug for LeetCode
  title: string;
  description: string;
  tests: TsTestCase[];
}

// For LeetCode problem stubs (title and titleSlug)
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
  status: Judge0Status;
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
 * Fetches a list of LeetCode problem stubs (title and titleSlug).
 */
async function fetchLeetProblemStubs(): Promise<TsLeetProblemStub[]> {
  if (cache.leetProblemStubs) {
    return cache.leetProblemStubs;
  }

  const leetCodeGraphQLQuery = `
    query problemsetQuestionListV2($categorySlug: String, $limit: Int, $skip: Int) {
      problemsetQuestionListV2(categorySlug: $categorySlug, limit: $limit, skip: $skip) {
        questions {
          title
          titleSlug
        }
      }
    }`;

  const variables = {
    categorySlug: "",
    limit: 100,
    skip: 0,
  };

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
    console.error(
      "LeetCode API request for stubs failed:",
      res.status,
      errorBody,
    );
    console.error("Failing Query (stubs):", leetCodeGraphQLQuery);
    console.error("Failing Variables (stubs):", JSON.stringify(variables));
    throw new Error(
      `Failed to fetch problem stubs from LeetCode: ${res.status} - ${errorBody}`,
    );
  }

  const json = (await res.json()) as {
    data?: {
      problemsetQuestionListV2?: {
        questions: Array<{
          title: string;
          titleSlug: string;
        }>;
      };
    };
  };

  const questionsData = json.data?.problemsetQuestionListV2?.questions; // Renamed to avoid conflict if any `questions` was global
  if (!questionsData) {
    console.error(
      "Unexpected LeetCode API response structure for stubs:",
      json,
    );
    cache.leetProblemStubs = [];
    return [];
  }

  // Explicitly type `q` if inference is problematic, or ensure `questionsData` is well-typed.
  // Given the type assertion for `json`, `q` should be inferred correctly here.
  const stubs: TsLeetProblemStub[] = questionsData.map((q) => ({
    title: q.title,
    titleSlug: q.titleSlug,
  }));

  cache.leetProblemStubs = stubs;
  return stubs;
}

/**
 * Fetches full details for a single LeetCode problem.
 */
async function fetchLeetProblemDetails(titleSlug: string): Promise<TsProblem> {
  const leetCodeQuestionDetailQuery = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        title
        titleSlug
        content
        sampleTestCase
        exampleTestcases # Fallback or alternative for sample tests
      }
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
      `LeetCode API request for problem details (${titleSlug}) failed:`,
      res.status,
      errorBody,
    );
    console.error("Failing Query (details):", leetCodeQuestionDetailQuery);
    console.error("Failing Variables (details):", JSON.stringify(variables));
    throw new Error(
      `Failed to fetch problem details from LeetCode for ${titleSlug}: ${res.status} - ${errorBody}`,
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
    console.error(
      `Unexpected LeetCode API response structure for problem details (${titleSlug}):`,
      json,
    );
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
      let stdin = lines[i].replace(/^Input:\s*/i, "").trim();
      let expected = lines[i + 1].replace(/^Output:\s*/i, "").trim();
      tests.push({ stdin, expected });
    }
  } else {
    console.warn(
      `No sample test cases found for LeetCode problem: ${titleSlug}`,
    );
  }

  return {
    id: questionData.titleSlug,
    title: questionData.title,
    description: questionData.content || "No description provided.",
    tests,
  };
}

/**
 * Fetch problems and sample tests from Codeforces
 */
async function fetchCFProblems(): Promise<TsProblem[]> {
  if (cache.cfProblems) {
    return cache.cfProblems;
  }

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
      problems: Array<{
        contestId: number;
        index: string;
        name: string;
        tags: string[];
      }>;
      problemStatistics: Array<any>;
    };
  };

  if (json.status !== "OK" || !json.result) {
    console.error("Codeforces API error or unexpected structure:", json);
    cache.cfProblems = [];
    return [];
  }

  const cfQuestions = json.result.problems; // Renamed to avoid potential conflict
  const problems: TsProblem[] = cfQuestions.map((p) => ({
    id: `${p.contestId}${p.index}`,
    title: p.name,
    description: `Problem from Codeforces: ${p.contestId}${p.index}. Tags: ${p.tags.join(", ")}. (Full description and tests require scraping or a different API endpoint for Codeforces, not included in this basic fetcher).`,
    tests: [],
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
    throw new Error(
      `Unsupported language: ${lang}. Supported languages are: ${Object.keys(LANGUAGE_IDS).join(", ")}`,
    );
  }

  const submissions = tests.map((t) => ({
    source_code: code,
    language_id: languageId,
    stdin: t.stdin,
    expected_output: t.expected,
  }));

  const resp = await fetch(
    `${JUDGE0_URL}/submissions/batch?base64_encoded=false&wait=true`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(JUDGE0_KEY && { "X-Auth-Token": JUDGE0_KEY }),
      },
      body: JSON.stringify({ submissions }),
    },
  );

  if (!resp.ok) {
    const errorBody = await resp.text();
    console.error("Judge0 API request failed:", resp.status, errorBody);
    throw new Error(`Judge0 submission failed: ${resp.status} - ${errorBody}`);
  }

  const results = (await resp.json()) as Judge0SubmissionResult[];
  return results;
}

// GraphQL resolvers
const resolvers = {
  Query: {
    randomProblem: async (
      _source: unknown, // _source (or parent) is the first argument
      args: { platform: string },
    ): Promise<TsProblem> => {
      if (args.platform.toLowerCase() === "leetcode") {
        const stubs = await fetchLeetProblemStubs();
        if (stubs.length === 0) {
          throw new Error(
            "No problem stubs fetched from LeetCode or platform is temporarily unavailable.",
          );
        }
        const randomStub = stubs[Math.floor(Math.random() * stubs.length)];
        return fetchLeetProblemDetails(randomStub.titleSlug);
      } else if (args.platform.toLowerCase() === "codeforces") {
        const arr = await fetchCFProblems();
        if (arr.length === 0) {
          throw new Error(
            "No problems fetched from Codeforces or platform is temporarily unavailable.",
          );
        }
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
      _source: unknown, // _source (or parent) is the first argument
      args: { input: TsJudgeInput },
    ): Promise<{ passed: boolean; details: any[] }> => {
      // Added return type for clarity
      const { code, lang, tests } = args.input;
      if (!tests || tests.length === 0) {
        throw new Error("No test cases provided for submission.");
      }

      const rawResults = await runJudge0Batch(tests, code, lang);

      // Log the raw results from Judge0 to understand its structure
      console.log("Judge0 Raw Results:", JSON.stringify(rawResults, null, 2));

      const details = rawResults.map((r: Judge0SubmissionResult, i: number) => {
        let statusText = "Unknown Status"; // Default value

        if (r && r.status && typeof r.status.description === "string") {
          statusText = r.status.description;
        } else {
          // Log if the status structure is not as expected
          console.warn(
            `Unexpected status structure for rawResult at index ${i}:`,
            r,
          );
          // Provide a more specific status if possible based on other fields
          if (r && r.compile_output) {
            statusText = "Compilation Error";
          } else if (r && r.stderr && !r.stdout) {
            // Often indicates a runtime error
            statusText = "Runtime Error";
          } else if (!r.status) {
            statusText = "Error: Status object missing";
          }
        }

        return {
          index: i,
          status: statusText,
          stdout: r.stdout,
          stderr: r.stderr,
          time: r.time ? parseFloat(r.time) : null,
          memory: r.memory,
        };
      });

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
