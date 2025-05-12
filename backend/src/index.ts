import dotenv from "dotenv";
dotenv.config();

import {
  ApolloServer,
  UserInputError,
  AuthenticationError,
} from "apollo-server-express";
import { gql } from "apollo-server-express";
import express, { Request, Response } from "express";
import http from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import fetch, { Response as FetchResponse } from "node-fetch";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { prisma } from "./db";
import { User as PrismaUser } from "@prisma/client"; // Import Prisma's User type

const JUDGE0_URL =
  process.env.JUDGE0_URL ||
  `http://localhost:${process.env.JUDGE0_PORT || "2358"}`;
const JUDGE0_KEY = process.env.JUDGE0_SECRET!;
const LANGUAGE_IDS: Record<string, number> = { cpp: 54, java: 62, python: 71 };
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined.");
  process.exit(1);
}
const TOKEN_COOKIE_NAME = "duelz_token";
const HASH_SALT_ROUNDS = 10;
const K_FACTOR = 32; // ELO K-factor

// --- Your existing INTERFACES ---
interface TsTestCase {
  stdin: string;
  expected: string;
}
interface TsCodeSnippet {
  lang: string;
  langSlug: string;
  code: string;
}
interface TsProblem {
  id: string;
  title: string;
  description: string;
  tests: TsTestCase[];
  codeSnippets?: TsCodeSnippet[];
  metaData?: string;
  platform: "leetcode" | "codeforces" | "internal";
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
interface TsLeetCodeProblemDataInput {
  codeSnippet: TsCodeSnippet;
  metaData: string;
}
interface TsJudgeInput {
  code: string;
  lang: string;
  tests: TsTestCaseInput[];
  leetCodeProblemData?: TsLeetCodeProblemDataInput;
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
  status?: Judge0Status;
  token: string;
}

// --- Your existing Duel Room State ---
type CompetitorRole = "competitor1" | "competitor2";
type UserRole = CompetitorRole | "spectator";
interface DuelCompetitor {
  socketId: string;
  userId: string;
  username: string;
  code: string;
  language: string;
  solvedProblem?: boolean;
  submissionTime?: number /* Time in ms when solved */;
}
interface DuelRoom {
  duelId: string;
  competitors: Partial<Record<CompetitorRole, DuelCompetitor>>;
  spectators: Set<string>;
  problem?: TsProblem;
  status: "waiting" | "active" | "finished";
  winner?: string | null;
  /* userId of winner, null for draw */ startTime?: number;
} // Added status, winner, startTime
const activeDuels = new Map<string, DuelRoom>();

// --- GraphQL Schema Definitions ---
const typeDefs = gql`
  scalar DateTime

  type Query {
    randomProblem(platform: String!): Problem!
    me: User
    listProblems(limit: Int = 20): [ProblemStub!]! # NEW
    recentMatches(userId: ID!, limit: Int = 10): [DuelMatch!] # NEW for profile page
  }

  type Mutation {
    signup(username: String!, email: String!, password: String!): AuthPayload!
    login(emailOrUsername: String!, password: String!): AuthPayload!
    logout: Boolean!
    judgeSubmission(input: JudgeInput!): JudgeResult!
    # recordDuelOutcome(input: RecordDuelOutcomeInput!): DuelMatch # Internal, or admin use
  }

  type User {
    id: ID!
    username: String!
    email: String!
    rating: Int!
    createdAt: String!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  # NEW ProblemStub for listProblems
  type ProblemStub {
    id: ID!
    title: String!
    platform: String!
    difficulty: String # Placeholder, not reliably fetched yet
    tags: [String!]
  }

  # NEW DuelMatch type for history
  type DuelMatch {
    id: ID!
    duelId: String!
    problemTitle: String!
    problemPlatform: String!
    playerOne: User!
    playerTwo: User!
    playerOneScore: Float!
    playerTwoScore: Float!
    playerOneOldRating: Int!
    playerOneNewRating: Int!
    playerTwoOldRating: Int!
    playerTwoNewRating: Int!
    playedAt: DateTime!
  }

  # --- Your existing Problem related types ---
  type CodeSnippet {
    lang: String!
    langSlug: String!
    code: String!
  }
  type Problem {
    id: ID!
    title: String!
    description: String!
    tests: [TestCase!]!
    platform: String!
    codeSnippets: [CodeSnippet!]
    metaData: String
  }
  type TestCase {
    stdin: String!
    expected: String!
  }
  input CodeSnippetInput {
    lang: String!
    langSlug: String!
    code: String!
  }
  input LeetCodeProblemDataInput {
    codeSnippet: CodeSnippetInput!
    metaData: String!
  }
  input JudgeInput {
    code: String!
    lang: String!
    tests: [TestCaseInput!]!
    leetCodeProblemData: LeetCodeProblemDataInput
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

// --- Helper for ELO ---
function calculateElo(
  ratingA: number,
  ratingB: number,
  scoreA: number,
): { newRatingA: number; newRatingB: number } {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA; // Or 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400))

  const scoreB = 1 - scoreA; // If A won (1), B lost (0). If A drew (0.5), B drew (0.5)

  const newRatingA = Math.round(ratingA + K_FACTOR * (scoreA - expectedA));
  const newRatingB = Math.round(ratingB + K_FACTOR * (scoreB - expectedB));

  return { newRatingA, newRatingB };
}

// --- Your existing API FETCHING LOGIC (fetchLeetProblemStubs, etc.) ---
// (These are assumed to be identical to your last provided version)
async function fetchLeetProblemStubs(): Promise<TsLeetProblemStub[]> {
  /* ... */
  if (cache.leetProblemStubs) return cache.leetProblemStubs;
  const query = `query problemsetQuestionListV2($categorySlug: String, $limit: Int, $skip: Int) { problemsetQuestionListV2(categorySlug: $categorySlug, limit: $limit, skip: $skip) { questions { title titleSlug } } }`;
  const vars = { categorySlug: "", limit: 100, skip: 0 };
  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://leetcode.com/",
    },
    body: JSON.stringify({ query, variables: vars }),
  });
  if (!res.ok) {
    console.error("LeetCode stubs API failed:", res.status, await res.text());
    throw new Error(`Failed to fetch stubs from LeetCode: ${res.status}`);
  }
  const json = (await res.json()) as any;
  const questionsData = json.data?.problemsetQuestionListV2?.questions;
  if (!questionsData) {
    console.error("Unexpected LeetCode API stub structure:", json);
    cache.leetProblemStubs = [];
    return [];
  }
  const stubs: TsLeetProblemStub[] = questionsData.map((q: any) => ({
    title: q.title,
    titleSlug: q.titleSlug,
  }));
  cache.leetProblemStubs = stubs;
  return stubs;
}
async function fetchLeetProblemDetails(titleSlug: string): Promise<TsProblem> {
  /* ... */
  const query = `query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { title titleSlug content sampleTestCase exampleTestcases codeSnippets { lang langSlug code } metaData } }`;
  const vars = { titleSlug };
  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://leetcode.com/",
    },
    body: JSON.stringify({ query, variables: vars }),
  });
  if (!res.ok) {
    console.error(
      `LeetCode details (${titleSlug}) failed:`,
      res.status,
      await res.text(),
    );
    throw new Error(
      `Failed to fetch details from LeetCode for ${titleSlug}: ${res.status}`,
    );
  }
  const json = (await res.json()) as any;
  const qData = json.data?.question;
  if (!qData) {
    console.error(`Unexpected LeetCode detail structure (${titleSlug}):`, json);
    throw new Error(
      `Could not retrieve details for LeetCode problem: ${titleSlug}`,
    );
  }
  const tests: TsTestCase[] = [];
  const tcStr = qData.sampleTestCase || qData.exampleTestcases;
  if (tcStr) {
    const lines = tcStr.split(/\r?\n/).filter(Boolean);
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
    id: qData.titleSlug,
    title: qData.title,
    description: qData.content || "No description.",
    tests,
    codeSnippets: qData.codeSnippets || undefined,
    metaData: qData.metaData || undefined,
    platform: "leetcode",
  };
}
async function fetchCFProblems(): Promise<TsProblem[]> {
  /* ... */
  if (cache.cfProblems) return cache.cfProblems;
  const res = await fetch("https://codeforces.com/api/problemset.problems");
  if (!res.ok) {
    console.error("Codeforces API failed:", res.status, await res.text());
    throw new Error(`Failed to fetch from Codeforces: ${res.status}`);
  }
  const json = (await res.json()) as any;
  if (json.status !== "OK" || !json.result) {
    console.error("Codeforces API error:", json);
    cache.cfProblems = [];
    return [];
  }
  const problems: TsProblem[] = json.result.problems.map((p: any) => ({
    id: `${p.contestId}${p.index}`,
    title: p.name,
    description: `CF Problem: ${p.contestId}${p.index}. Tags: ${p.tags.join(", ")}. (No full description/tests from this API).`,
    tests: [],
    platform: "codeforces",
  }));
  cache.cfProblems = problems;
  return problems;
}
// --- Your existing JUDGE0 LOGIC (runJudge0Batch) ---
async function runJudge0Batch(
  tests: TsTestCaseInput[],
  userCode: string,
  lang: string,
  leetCodeData?: TsLeetCodeProblemDataInput,
): Promise<Judge0SubmissionResult[]> {
  /* ... (Same as your provided version) ... */
  const languageId = LANGUAGE_IDS[lang.toLowerCase()];
  if (languageId === undefined) {
    throw new UserInputError(
      `Unsupported language: ${lang}. Supported: ${Object.keys(LANGUAGE_IDS).join(", ")}`,
    );
  }
  if (leetCodeData) {
    console.log("Received LeetCode Data for Driver Generation (TODO):");
    console.log("Language:", lang);
    console.log(
      "Code Snippet (Preview):",
      leetCodeData.codeSnippet.code.substring(0, 100) + "...",
    );
    console.log(
      "Meta Data (Preview):",
      leetCodeData.metaData.substring(0, 100) + "...",
    );
  }
  let sourceCodeForJudge = userCode;
  if (leetCodeData) {
    console.warn(
      `LeetCode driver for ${lang} not yet implemented. Running user code directly.`,
    );
  }
  const submissionsPayload = tests.map((t) => ({
    source_code: sourceCodeForJudge,
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
  const tokensToPoll: string[] = [];
  const initialErrorResultsMap: Map<number, Judge0SubmissionResult> = new Map();
  tokenResponses.forEach((tr, index) => {
    if ("token" in tr && tr.token) {
      tokensToPoll.push(tr.token);
    } else {
      let errorMessage = "Batch submission creation failed";
      const potentialError = (tr as { error?: any }).error;
      if (potentialError && typeof potentialError === "string")
        errorMessage = potentialError;
      else if (
        potentialError &&
        typeof potentialError === "object" &&
        potentialError !== null
      )
        errorMessage = JSON.stringify(potentialError);
      else if (Object.keys(tr).length > 0 && !("token" in tr))
        errorMessage = `Invalid submission parameters: ${JSON.stringify(tr)}`;
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
      if (result.status && result.status.id > 2) return result;
      attempts++;
    }
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
      if (polledIdx < polledResults.length) {
        finalResults.push(polledResults[polledIdx++]);
      } else {
        finalResults.push({
          token: `missing_polled_result_${i}`,
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

// --- RESOLVERS ---
const resolvers = {
  Query: {
    me: async (
      _p: any,
      _a: any,
      ctx: { userId?: string; prisma: typeof prisma },
    ) => {
      /* ... same as before ... */
      if (!ctx.userId) return null;
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.userId },
      });
      if (!user) return null;
      const { passwordHash, ...userData } = user;
      return userData;
    },
    randomProblem: async (
      _p: unknown,
      args: { platform: string },
    ): Promise<TsProblem> => {
      /* ... same as before ... */
      if (args.platform.toLowerCase() === "leetcode") {
        const stubs = await fetchLeetProblemStubs();
        if (stubs.length === 0)
          throw new UserInputError("No LeetCode stubs found.");
        const randomStub = stubs[Math.floor(Math.random() * stubs.length)];
        return fetchLeetProblemDetails(randomStub.titleSlug);
      } else if (args.platform.toLowerCase() === "codeforces") {
        const arr = await fetchCFProblems();
        if (arr.length === 0)
          throw new UserInputError("No Codeforces problems found.");
        return arr[Math.floor(Math.random() * arr.length)];
      }
      throw new UserInputError("Unsupported platform.");
    },
    listProblems: async (
      _p: any,
      args: { limit?: number },
      ctx: { prisma: typeof prisma },
    ): Promise<
      Array<Partial<TsProblem & { difficulty?: string; tags?: string[] }>>
    > => {
      // NEW
      const limit = args.limit || 20;
      // For now, combining stubs from external APIs. Later, could fetch from local DB.
      const leetStubsPromise = fetchLeetProblemStubs().catch((err) => {
        console.error("ListProblems: LeetCode fetch failed:", err.message);
        return [];
      });
      const cfProblemsPromise = fetchCFProblems().catch((err) => {
        console.error("ListProblems: Codeforces fetch failed:", err.message);
        return [];
      });

      const [leetStubs, cfProblems] = await Promise.all([
        leetStubsPromise,
        cfProblemsPromise,
      ]);
      const combined: Array<any> = []; // Using 'any' for simplicity of combining different structures initially

      leetStubs.forEach((stub) =>
        combined.push({
          id: stub.titleSlug,
          title: stub.title,
          platform: "leetcode",
        }),
      );
      cfProblems.forEach((prob) => {
        const tagsMatch = prob.description.match(/Tags: (.*?)\./);
        combined.push({
          id: prob.id,
          title: prob.title,
          platform: prob.platform,
          tags: tagsMatch && tagsMatch[1] ? tagsMatch[1].split(", ") : [],
        });
      });

      return combined.sort(() => 0.5 - Math.random()).slice(0, limit);
    },
    recentMatches: async (
      _p: any,
      args: { userId: string; limit?: number },
      ctx: { prisma: typeof prisma },
    ) => {
      // NEW
      if (!args.userId)
        throw new UserInputError(
          "User ID is required to fetch recent matches.",
        );
      const limit = args.limit || 10;
      return ctx.prisma.duelMatch.findMany({
        where: {
          OR: [{ playerOneId: args.userId }, { playerTwoId: args.userId }],
        },
        orderBy: { playedAt: "desc" },
        take: limit,
        include: {
          // Include related user data for display
          playerOne: { select: { id: true, username: true, rating: true } },
          playerTwo: { select: { id: true, username: true, rating: true } },
        },
      });
    },
  },
  Mutation: {
    signup: async (
      _p: any,
      args: any,
      ctx: { res: Response; prisma: typeof prisma },
    ) => {
      /* ... same as before ... */
      const { username, email, password } = args;
      if (!username || !email || !password)
        throw new UserInputError("Username, email, and password are required.");
      if (password.length < 6)
        throw new UserInputError("Password must be at least 6 characters.");
      if (!/^\S+@\S+\.\S+$/.test(email))
        throw new UserInputError("Invalid email format.");
      const existingUserByEmail = await ctx.prisma.user.findUnique({
        where: { email },
      });
      if (existingUserByEmail)
        throw new UserInputError("Email already in use.");
      const existingUserByUsername = await ctx.prisma.user.findUnique({
        where: { username },
      });
      if (existingUserByUsername)
        throw new UserInputError("Username already taken.");
      const passwordHash = await bcrypt.hash(password, HASH_SALT_ROUNDS);
      const user = await ctx.prisma.user.create({
        data: { username, email, passwordHash },
      });
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: "7d" },
      );
      ctx.res.cookie(TOKEN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });
      const { passwordHash: _, ...userData } = user;
      return { token, user: userData };
    },
    login: async (
      _p: any,
      args: any,
      ctx: { res: Response; prisma: typeof prisma },
    ) => {
      /* ... same as before ... */
      const { emailOrUsername, password } = args;
      if (!emailOrUsername || !password)
        throw new UserInputError("Email/Username and password are required.");
      const user = await ctx.prisma.user.findFirst({
        where: {
          OR: [{ email: emailOrUsername }, { username: emailOrUsername }],
        },
      });
      if (!user) throw new AuthenticationError("Invalid credentials.");
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword)
        throw new AuthenticationError("Invalid credentials.");
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: "7d" },
      );
      ctx.res.cookie(TOKEN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });
      const { passwordHash: _, ...userData } = user;
      return { token, user: userData };
    },
    logout: async (_p: any, _a: any, ctx: { res: Response }) => {
      /* ... same as before ... */
      ctx.res.clearCookie(TOKEN_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
      return true;
    },
    judgeSubmission: async (
      _s: unknown,
      args: { input: TsJudgeInput },
      ctx: { prisma: typeof prisma; userId?: string },
    ): Promise<{ passed: boolean; details: any[] }> => {
      /* ... same as before ... */
      // console.log("Judge submission by user:", ctx.userId); // Example of using authenticated user
      const { code, lang, tests, leetCodeProblemData } = args.input;
      if (!tests || tests.length === 0) {
        throw new UserInputError("No test cases provided.");
      }
      const rawResults = await runJudge0Batch(
        tests,
        code,
        lang,
        leetCodeProblemData,
      );
      const details = rawResults.map((r: Judge0SubmissionResult, i: number) => {
        let statusText = "Processing Error";
        if (r && r.compile_output) statusText = "Compilation Error";
        else if (r && r.status && r.status.description)
          statusText = r.status.description;
        else if (r && r.message) statusText = r.message;
        else if (r && r.stderr && !r.status) statusText = "Runtime Error";
        else if (!r || !r.status) statusText = "Error: Status Invalid/Missing";
        let finalStderr = r.stderr;
        if (statusText === "Compilation Error" && r.compile_output)
          finalStderr = r.compile_output;
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

// --- Server Setup ---
async function startServer() {
  const app = express();
  app.use(cookieParser());

  const httpServer = http.createServer(app);

  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req, res }: { req: Request; res: Response }) => {
      /* ... same as before ... */
      const token = req.cookies[TOKEN_COOKIE_NAME];
      let userId;
      let username;
      if (token && JWT_SECRET) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as {
            userId: string;
            username: string;
          };
          userId = decoded.userId;
          username = decoded.username;
        } catch (err: any) {
          console.warn("Invalid or expired JWT:", err.message);
          res.clearCookie(TOKEN_COOKIE_NAME);
        }
      }
      return { req, res, prisma, userId, username };
    },
  });

  await apolloServer.start();
  apolloServer.applyMiddleware({
    app,
    path: "/graphql",
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      credentials: true,
    },
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // --- Socket.IO Duel Logic ---
  io.on("connection", (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    let currentDuelId: string | null = null; // Store current duel ID for this socket for cleanup
    let currentUserId: string | null = null; // Store current user ID for this socket

    socket.on(
      "joinDuel",
      async (data: {
        duelId: string;
        userId: string;
        username: string;
        initialCode?: string;
        initialLanguage?: string;
      }) => {
        const {
          duelId,
          userId,
          username,
          initialCode = "// Start coding...",
          initialLanguage = "cpp",
        } = data;

        // If socket was previously in another duel, leave it first (optional, good practice)
        if (currentDuelId && currentDuelId !== duelId) {
          socket.leave(currentDuelId);
          // Add logic here to remove user from 'activeDuels.get(currentDuelId)' state if needed
          console.log(
            `Socket ${socket.id} left previous duel ${currentDuelId}`,
          );
        }
        currentDuelId = duelId;
        currentUserId = userId; // Store for disconnect

        socket.join(duelId);
        console.log(
          `User ${username} (DB_ID: ${userId}, Socket: ${socket.id}) attempting to join duel ${duelId}`,
        );

        let room = activeDuels.get(duelId);
        if (!room) {
          room = {
            duelId,
            competitors: {},
            spectators: new Set(),
            status: "waiting",
          }; // Initialize status
          activeDuels.set(duelId, room);
          console.log(`Created new duel room: ${duelId}`);
        }

        let assignedRole: UserRole | null = null;
        let competitorJustAddedToMakeTwo = false;

        let existingRole: CompetitorRole | null = null;
        if (room.competitors.competitor1?.userId === userId)
          existingRole = "competitor1";
        else if (room.competitors.competitor2?.userId === userId)
          existingRole = "competitor2";

        if (existingRole) {
          assignedRole = existingRole;
          console.log(
            `User ${username} (ID: ${userId}) rejoining as ${assignedRole}`,
          );
          if (room.competitors[assignedRole]) {
            // Should always be true
            room.competitors[assignedRole]!.socketId = socket.id;
            room.competitors[assignedRole]!.username = username;
          }
        } else if (!room.competitors.competitor1) {
          assignedRole = "competitor1";
          room.competitors.competitor1 = {
            socketId: socket.id,
            userId,
            username,
            code: initialCode,
            language: initialLanguage,
            solvedProblem: false,
          };
        } else if (!room.competitors.competitor2) {
          assignedRole = "competitor2";
          room.competitors.competitor2 = {
            socketId: socket.id,
            userId,
            username,
            code: initialCode,
            language: initialLanguage,
            solvedProblem: false,
          };
          competitorJustAddedToMakeTwo = true; // Now we have two
        } else {
          assignedRole = "spectator";
          room.spectators.add(socket.id);
        }

        socket.emit("assignedRole", {
          duelId,
          role: assignedRole,
          userId,
          username,
        });

        const competitorStatesForEmit = Object.values(room.competitors)
          .map((comp) =>
            comp
              ? {
                  userId: comp.userId,
                  username: comp.username,
                  role: Object.keys(room!.competitors).find(
                    (key) =>
                      room!.competitors[key as CompetitorRole]?.userId ===
                      comp.userId,
                  ) as CompetitorRole,
                  code: comp.code,
                  language: comp.language,
                  solvedProblem: comp.solvedProblem,
                }
              : null,
          )
          .filter((c) => c && c.role);

        socket.emit("duelState", {
          competitors: competitorStatesForEmit,
          problem: room.problem,
          status: room.status,
        });
        socket
          .to(duelId)
          .emit("userJoined", { userId, username, role: assignedRole });
        console.log(
          `User ${username} (ID: ${userId}) assigned role ${assignedRole} in duel ${duelId}`,
        );

        if (
          room.competitors.competitor1 &&
          room.competitors.competitor2 &&
          room.status === "waiting" &&
          (!room.problem || competitorJustAddedToMakeTwo)
        ) {
          room.status = "active"; // Mark duel as active
          room.startTime = Date.now(); // Record start time
          console.log(
            `Duel ${duelId} is now active. Start time: ${room.startTime}. Assigning problem...`,
          );
          io.to(duelId).emit("duelStatusUpdate", {
            status: room.status,
            startTime: room.startTime,
          });
          try {
            const stubs = await fetchLeetProblemStubs(); // Assuming this fetches varied problems
            if (stubs.length > 0) {
              const randomStub =
                stubs[Math.floor(Math.random() * stubs.length)];
              const problemDetails = await fetchLeetProblemDetails(
                randomStub.titleSlug,
              );
              room.problem = problemDetails;
              io.to(duelId).emit("duelProblemAssigned", {
                problem: problemDetails,
              });
            } else {
              io.to(duelId).emit("duelError", {
                message: "Failed to assign problem: No problems available.",
              });
            }
          } catch (error: any) {
            console.error(`Error assigning problem:`, error);
            io.to(duelId).emit("duelError", {
              message: "Error assigning problem.",
            });
          }
        } else if (room.problem) {
          socket.emit("duelProblemAssigned", { problem: room.problem });
          socket.emit("duelStatusUpdate", {
            status: room.status,
            startTime: room.startTime,
            winner: room.winner,
          });
        }
      },
    );

    // When a competitor submits a correct solution
    socket.on(
      "problemSolved",
      async (data: {
        duelId: string;
        userId: string;
        role: CompetitorRole;
        submissionTime: number;
      }) => {
        const room = activeDuels.get(data.duelId);
        if (
          !room ||
          room.status !== "active" ||
          !room.competitors[data.role] ||
          room.competitors[data.role]?.userId !== data.userId
        ) {
          console.warn("Invalid problemSolved event or duel not active:", data);
          return;
        }

        // Mark this competitor as solved
        room.competitors[data.role]!.solvedProblem = true;
        room.competitors[data.role]!.submissionTime = data.submissionTime; // Time from duel start to solve

        console.log(
          `User ${room.competitors[data.role]?.username} (role ${data.role}) solved the problem in duel ${data.duelId}`,
        );
        io.to(data.duelId).emit("competitorSolved", {
          userId: data.userId,
          role: data.role,
          submissionTime: data.submissionTime,
        });

        // Check if this determines a winner (e.g., first to solve)
        // This is a simplified win condition. Real duels might have timers, multiple problems, etc.
        if (!room.winner) {
          // If no winner yet
          room.winner = data.userId;
          room.status = "finished";
          console.log(
            `Duel ${data.duelId} finished. Winner: ${room.competitors[data.role]?.username}`,
          );
          io.to(data.duelId).emit("duelEnded", {
            winnerId: room.winner,
            status: room.status,
          });

          // ELO Calculation and DB Update
          const c1 = room.competitors.competitor1;
          const c2 = room.competitors.competitor2;

          if (c1 && c2 && room.problem) {
            // Both competitors must exist
            try {
              const user1 = await prisma.user.findUnique({
                where: { id: c1.userId },
              });
              const user2 = await prisma.user.findUnique({
                where: { id: c2.userId },
              });

              if (user1 && user2) {
                const score1 =
                  room.winner === c1.userId
                    ? 1.0
                    : room.winner === c2.userId
                      ? 0.0
                      : 0.5; // 0.5 for draw (not implemented here)
                const score2 = 1.0 - score1;

                const { newRatingA: newRating1, newRatingB: newRating2 } =
                  calculateElo(user1.rating, user2.rating, score1);

                // Update ratings in DB
                await prisma.user.update({
                  where: { id: c1.userId },
                  data: { rating: newRating1 },
                });
                await prisma.user.update({
                  where: { id: c2.userId },
                  data: { rating: newRating2 },
                });

                // Record the duel match
                await prisma.duelMatch.create({
                  data: {
                    duelId: room.duelId,
                    problemTitle: room.problem.title,
                    problemPlatform: room.problem.platform,
                    playerOneId: c1.userId,
                    playerTwoId: c2.userId,
                    playerOneScore: score1,
                    playerTwoScore: score2,
                    playerOneOldRating: user1.rating,
                    playerOneNewRating: newRating1,
                    playerTwoOldRating: user2.rating,
                    playerTwoNewRating: newRating2,
                  },
                });
                console.log(
                  `Ratings updated for duel ${room.duelId}: ${user1.username} ${user1.rating}->${newRating1}, ${user2.username} ${user2.rating}->${newRating2}`,
                );
                // Optionally emit new ratings to clients
                io.to(room.duelId).emit("ratingsUpdated", {
                  [c1.userId]: {
                    oldRating: user1.rating,
                    newRating: newRating1,
                  },
                  [c2.userId]: {
                    oldRating: user2.rating,
                    newRating: newRating2,
                  },
                });
              }
            } catch (eloError) {
              console.error(
                "Error calculating/updating ELO for duel " + room.duelId,
                eloError,
              );
            }
          }
        }
      },
    );

    socket.on(
      "codeUpdate",
      (data: {
        duelId: string;
        userId: string;
        code: string;
        role: CompetitorRole;
      }) => {
        /* ... same ... */
        const room = activeDuels.get(data.duelId);
        if (
          room &&
          room.competitors[data.role]?.socketId === socket.id &&
          room.competitors[data.role]?.userId === data.userId
        ) {
          room.competitors[data.role]!.code = data.code;
          io.to(data.duelId).emit("competitorCodeUpdated", {
            userId: data.userId,
            role: data.role,
            code: data.code,
          });
        } else {
          console.warn(
            `Unauthorized codeUpdate: socket ${socket.id}, user ${data.userId}, role ${data.role}, duel ${data.duelId}`,
          );
        }
      },
    );
    socket.on(
      "languageUpdate",
      (data: {
        duelId: string;
        userId: string;
        language: string;
        role: CompetitorRole;
      }) => {
        /* ... same ... */
        const room = activeDuels.get(data.duelId);
        if (
          room &&
          room.competitors[data.role]?.socketId === socket.id &&
          room.competitors[data.role]?.userId === data.userId
        ) {
          room.competitors[data.role]!.language = data.language;
          io.to(data.duelId).emit("competitorLanguageUpdated", {
            userId: data.userId,
            role: data.role,
            language: data.language,
          });
        } else {
          console.warn(
            `Unauthorized languageUpdate: socket ${socket.id}, user ${data.userId}, role ${data.role}, duel ${data.duelId}`,
          );
        }
      },
    );
    socket.on("disconnect", () => {
      /* ... same, but ensure currentDuelId and currentUserId are used if you implement leaving current duel ... */
      console.log(`Socket disconnected: ${socket.id}`);
      // If using currentDuelId and currentUserId for more precise cleanup:
      if (currentDuelId && currentUserId) {
        const room = activeDuels.get(currentDuelId);
        if (room) {
          let userWhoLeft: {
            userId: string;
            username: string;
            role: UserRole;
          } | null = null;
          for (const role of [
            "competitor1",
            "competitor2",
          ] as CompetitorRole[]) {
            const competitor = room.competitors[role];
            if (
              competitor?.socketId === socket.id &&
              competitor.userId === currentUserId
            ) {
              userWhoLeft = {
                userId: competitor.userId,
                username: competitor.username,
                role,
              };
              delete room.competitors[role];
              console.log(
                `Competitor ${userWhoLeft.username} removed from duel ${currentDuelId}`,
              );
              // If a competitor leaves an active duel, you might want to end it or declare a forfeit
              if (room.status === "active") {
                room.status = "finished";
                room.winner =
                  (role === "competitor1"
                    ? room.competitors.competitor2?.userId
                    : room.competitors.competitor1?.userId) || null; // Other player wins
                io.to(currentDuelId).emit("duelEnded", {
                  winnerId: room.winner,
                  status: room.status,
                  forfeitedBy: userWhoLeft.userId,
                });
                console.log(
                  `Duel ${currentDuelId} ended due to forfeit by ${userWhoLeft.username}. Winner: ${room.winner}`,
                );
                // Potentially trigger ELO update for forfeit here
              }
              break;
            }
          }
          if (room.spectators.has(socket.id)) {
            if (!userWhoLeft)
              userWhoLeft = {
                userId: `spectator-${socket.id}`,
                username: "Spectator",
                role: "spectator",
              };
            room.spectators.delete(socket.id);
            console.log(
              `Spectator (socket ${socket.id}) removed from duel ${currentDuelId}`,
            );
          }

          if (userWhoLeft) {
            io.to(currentDuelId).emit("userLeft", userWhoLeft);
          }

          if (
            Object.keys(room.competitors).length === 0 &&
            room.spectators.size === 0
          ) {
            activeDuels.delete(currentDuelId);
            console.log(`Duel room ${currentDuelId} is now empty and removed.`);
          }
        }
      } else {
        // Fallback to iterating all rooms if currentDuelId/currentUserId not set for socket
        activeDuels.forEach((room, dId) => {
          /* ... your previous broader disconnect logic ... */
        });
      }
    });
  });

  const port = process.env.PORT || 4000;
  httpServer.listen(port, () => {
    /* ... same console logs ... */
    console.log(
      `🚀 GraphQL Server ready at http://localhost:${port}${apolloServer.graphqlPath}`,
    );
    console.log(`🔌 Socket.IO Server listening on port ${port}`);
    console.log(`📡 Judge0 API URL: ${JUDGE0_URL}`);
    console.log(
      `🌐 Frontend URL for CORS: ${process.env.FRONTEND_URL || "http://localhost:5173"}`,
    );
  });
}

startServer().catch((error) => {
  console.error("☠️ Failed to start server:", error);
  process.exit(1);
});
