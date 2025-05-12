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
import {
  User as PrismaUser,
  TournamentStatus,
  PairingSystem,
} from "@prisma/client";

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

// --- Your existing Interfaces ---
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

// --- Your existing Duel & Hall States/Types ---
type CompetitorRole = "competitor1" | "competitor2";
type UserRole = CompetitorRole | "spectator";
interface DuelCompetitor {
  socketId: string;
  userId: string;
  username: string;
  code: string;
  language: string;
  solvedProblem?: boolean;
  submissionTime?: number;
}
interface DuelRoom {
  duelId: string;
  competitors: Partial<Record<CompetitorRole, DuelCompetitor>>;
  spectators: Set<string>;
  problem?: TsProblem;
  status: "waiting" | "active" | "finished";
  winner?: string | null;
  startTime?: number;
  tournamentId?: string;
} // Added tournamentId
const activeDuels = new Map<string, DuelRoom>();
interface HallParticipant {
  socketId: string;
  userId: string;
  username: string;
  rating: number;
}
interface TournamentHall {
  tournamentId: string;
  organizerId: string;
  participants: Map<string, HallParticipant>;
}
const activeHalls = new Map<string, TournamentHall>();

// --- GraphQL Type Definitions (from your last provided version) ---
const typeDefs = gql`
  scalar DateTime
  type Query {
    randomProblem(platform: String!): Problem!
    me: User
    listProblems(limit: Int = 20): [ProblemStub!]!
    recentMatches(userId: ID!, limit: Int = 10): [DuelMatch!] # Ensure DuelMatch is defined
    getTournament(tournamentId: ID!): Tournament # Ensure Tournament is defined
    listTournaments(status: TournamentStatus): [Tournament!] # Ensure TournamentStatus is defined
  }
  type Mutation {
    signup(username: String!, email: String!, password: String!): AuthPayload!
    login(emailOrUsername: String!, password: String!): AuthPayload!
    logout: Boolean!
    judgeSubmission(input: JudgeInput!): JudgeResult!
    createTournament(
      name: String!
      maxParticipants: Int
      hasVideo: Boolean
      problemSetType: String # Should match enum if defined, e.g., ProblemSetTypeEnum
      curatedProblemIds: [String!]
    ): Tournament!
  }
  type User {
    id: ID!
    username: String!
    email: String!
    rating: Int!
    createdAt: String! # Consider DateTime scalar
  }
  type AuthPayload {
    token: String!
    user: User!
  }
  type ProblemStub {
    id: ID!
    title: String!
    platform: String!
    difficulty: String # This is often not available in stub APIs
    tags: [String!]
  }
  type DuelMatch {
    id: ID!
    duelId: String! # Added field for clarity
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
    playedAt: DateTime! # Consider DateTime scalar
  }
  enum TournamentStatus {
    PENDING
    ACTIVE
    COMPLETED
    CANCELLED
  }
  enum PairingSystem {
    RANDOM
    SWISS
  } # Ensure this is defined in Prisma schema as well
  # enum ProblemSetTypeEnum { RANDOM_LEETCODE RANDOM_CODEFORCES CURATED } # Example if you want strong typing

  type Tournament {
    id: ID!
    name: String!
    organizer: User!
    status: TournamentStatus!
    pairingSystem: PairingSystem!
    maxParticipants: Int
    hasVideo: Boolean!
    problemSetType: String! # Or ProblemSetTypeEnum!
    curatedProblemIds: [String!]
    createdAt: DateTime! # Consider DateTime scalar
    participants: [TournamentParticipant!] # List of participants
  }
  type TournamentParticipant { # Represents a user's participation in a tournament
    id: ID! # Prisma record ID
    user: User!
    joinedAt: DateTime! # Consider DateTime scalar
    isActive: Boolean! # If they are still active (not kicked/left)
  }
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

// --- Helper Functions (ELO, Problem Fetching, Judging) ---
function calculateElo(
  ratingA: number,
  ratingB: number,
  scoreA: number,
): { newRatingA: number; newRatingB: number } {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA; // Or 1 / (1 + 10^((R_a - R_b)/400))
  const scoreB = 1 - scoreA; // Assuming S_a + S_b = 1
  const newRatingA = Math.round(ratingA + K_FACTOR * (scoreA - expectedA));
  const newRatingB = Math.round(ratingB + K_FACTOR * (scoreB - expectedB));
  return { newRatingA, newRatingB };
}
async function fetchLeetProblemStubs(): Promise<TsLeetProblemStub[]> {
  /* Copied from your provided code */
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
  /* Copied from your provided code */
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
  /* Copied from your provided code */
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
async function runJudge0Batch(
  tests: TsTestCaseInput[],
  userCode: string,
  lang: string,
  leetCodeData?: TsLeetCodeProblemDataInput,
): Promise<Judge0SubmissionResult[]> {
  /* Copied from your provided code */
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

// --- Resolvers (Your existing ones + New Auth/Tournament resolvers) ---
const resolvers = {
  Query: {
    me: async (
      _parent: any,
      _args: any,
      context: { userId?: string; prisma: typeof prisma },
    ) => {
      /* Copied from your provided code */
      if (!context.userId) return null;
      const user = await context.prisma.user.findUnique({
        where: { id: context.userId },
      });
      if (!user) return null;
      const { passwordHash, ...userData } = user;
      return userData;
    },
    randomProblem: async (
      _parent: unknown,
      args: { platform: string },
    ): Promise<TsProblem> => {
      /* Copied from your provided code */
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
      _parent: any,
      args: { limit?: number },
      context: { prisma: typeof prisma },
    ): Promise<
      Array<Partial<TsProblem & { difficulty?: string; tags?: string[] }>>
    > => {
      /* Copied from your provided code */
      const limit = args.limit || 20;
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
      const combined: Array<any> = [];
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
      _parent: any,
      args: { userId: string; limit?: number },
      context: { prisma: typeof prisma },
    ) => {
      /* Copied from your provided code */
      if (!args.userId)
        throw new UserInputError(
          "User ID is required to fetch recent matches.",
        );
      const limit = args.limit || 10;
      return context.prisma.duelMatch.findMany({
        // This will error if DuelMatch is not in Prisma schema
        where: {
          OR: [{ playerOneId: args.userId }, { playerTwoId: args.userId }],
        },
        orderBy: { playedAt: "desc" },
        take: limit,
        include: {
          playerOne: { select: { id: true, username: true, rating: true } },
          playerTwo: { select: { id: true, username: true, rating: true } },
        },
      });
    },
    getTournament: async (
      _parent: any,
      { tournamentId }: { tournamentId: string },
      context: { prisma: typeof prisma },
    ) => {
      /* Copied from your provided code */
      return context.prisma.tournament.findUnique({
        // This will error if Tournament is not in Prisma schema
        where: { id: tournamentId },
        include: { organizer: true, participants: { include: { user: true } } },
      });
    },
    listTournaments: async (
      _parent: any,
      { status }: { status?: TournamentStatus },
      context: { prisma: typeof prisma },
    ) => {
      /* Copied from your provided code */
      return context.prisma.tournament.findMany({
        // This will error if Tournament is not in Prisma schema
        where: status
          ? { status }
          : {
              status: {
                notIn: [TournamentStatus.CANCELLED, TournamentStatus.COMPLETED],
              },
            },
        orderBy: { createdAt: "desc" },
        include: { organizer: true },
      });
    },
  },
  Mutation: {
    signup: async (
      _parent: any,
      args: any,
      context: { res: Response; prisma: typeof prisma },
    ) => {
      /* Copied from your provided code */
      const { username, email, password } = args;
      if (!username || !email || !password)
        throw new UserInputError("Username, email, and password are required.");
      if (password.length < 6)
        throw new UserInputError("Password must be at least 6 characters.");
      if (!/^\S+@\S+\.\S+$/.test(email))
        throw new UserInputError("Invalid email format.");
      const existingUserByEmail = await context.prisma.user.findUnique({
        where: { email },
      });
      if (existingUserByEmail)
        throw new UserInputError("Email already in use.");
      const existingUserByUsername = await context.prisma.user.findUnique({
        where: { username },
      });
      if (existingUserByUsername)
        throw new UserInputError("Username already taken.");
      const passwordHash = await bcrypt.hash(password, HASH_SALT_ROUNDS);
      const user = await context.prisma.user.create({
        data: { username, email, passwordHash },
      });
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: "7d" },
      );
      context.res.cookie(TOKEN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });
      const { passwordHash: _, ...userData } = user;
      return { token, user: userData };
    },
    login: async (
      _parent: any,
      args: any,
      context: { res: Response; prisma: typeof prisma },
    ) => {
      /* Copied from your provided code */
      const { emailOrUsername, password } = args;
      if (!emailOrUsername || !password)
        throw new UserInputError("Email/Username and password are required.");
      const user = await context.prisma.user.findFirst({
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
      context.res.cookie(TOKEN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });
      const { passwordHash: _, ...userData } = user;
      return { token, user: userData };
    },
    logout: async (_parent: any, _args: any, context: { res: Response }) => {
      /* Copied from your provided code */
      context.res.clearCookie(TOKEN_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
      return true;
    },
    judgeSubmission: async (
      _source: unknown,
      args: { input: TsJudgeInput },
      context: { prisma: typeof prisma; userId?: string },
    ): Promise<{ passed: boolean; details: any[] }> => {
      /* Copied from your provided code */
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
    createTournament: async (
      _parent: any,
      args: {
        name: string;
        maxParticipants?: number;
        hasVideo?: boolean;
        problemSetType?: string;
        curatedProblemIds?: string[];
      },
      context: { userId?: string; username?: string; prisma: typeof prisma },
    ) => {
      /* Copied from your provided code with slight modifications from previous response */
      console.log(
        "Create Tournament Resolver - Context UserID:",
        context.userId,
        "Context Username:",
        context.username,
      );
      if (!context.userId) {
        throw new AuthenticationError(
          "You must be logged in to create a tournament.",
        );
      }
      const {
        name,
        maxParticipants,
        hasVideo,
        problemSetType,
        curatedProblemIds,
      } = args;
      if (!name || name.trim() === "")
        throw new UserInputError("Tournament name cannot be empty.");

      const tournament = await context.prisma.tournament.create({
        data: {
          name,
          organizerId: context.userId,
          maxParticipants,
          hasVideo: hasVideo || false,
          problemSetType: problemSetType || "RANDOM_LEETCODE",
          curatedProblemIds:
            problemSetType === "CURATED" && curatedProblemIds
              ? curatedProblemIds
              : [],
          status: TournamentStatus.PENDING,
          pairingSystem: PairingSystem.RANDOM, // Ensure PairingSystem is imported or string
        },
        include: { organizer: { select: { id: true, username: true } } },
      });
      activeHalls.set(tournament.id, {
        tournamentId: tournament.id,
        organizerId: context.userId,
        participants: new Map(),
      });
      console.log(
        `Tournament Hall initialized for tournament: ${tournament.id} by organizer ${context.userId} (${context.username || "N/A"})`,
      );
      return tournament;
    },
  },
};

// --- Server Setup ---
async function startServer() {
  const app = express();
  app.use(cookieParser()); // This must be before Apollo middleware

  const httpServer = http.createServer(app);

  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req, res }: { req: Request; res: Response }) => {
      // console.log("GraphQL Context: Raw req.cookies:", req.cookies); // For debugging cookies
      const token = req.cookies[TOKEN_COOKIE_NAME];
      // console.log(`GraphQL Context: Token from cookie ('${TOKEN_COOKIE_NAME}'):`, token ? "Present" : "Missing");
      let userId;
      let username;
      if (token && JWT_SECRET) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as {
            userId: string;
            username: string;
            iat?: number;
            exp?: number;
          };
          userId = decoded.userId;
          username = decoded.username;
          // console.log(`GraphQL Context: JWT Decoded - UserID: ${userId}, Username: ${username}`);
        } catch (err: any) {
          console.warn("GraphQL Context: JWT Verification Error:", err.message);
          res.clearCookie(TOKEN_COOKIE_NAME, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
          });
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

  io.use(async (socket, next) => {
    /* Your existing socket auth middleware */
    const cookiesHeader = socket.handshake.headers.cookie;
    if (cookiesHeader) {
      const parsedCookies: Record<string, string> = {};
      cookiesHeader.split(";").forEach((cookie) => {
        const parts = cookie.match(/(.*?)=(.*)$/);
        if (parts) {
          const name = parts[1].trim();
          const value = (parts[2] || "").trim();
          parsedCookies[name] = value;
        }
      });
      const token = parsedCookies[TOKEN_COOKIE_NAME];
      if (token && JWT_SECRET) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as {
            userId: string;
            username: string;
          };
          const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
          }); // Corrected to prisma.user
          if (user) {
            socket.data.authUser = {
              userId: user.id,
              username: user.username,
              rating: user.rating,
            };
            console.log(
              `Socket ${socket.id} authenticated via cookie as user ${user.username} (Rating: ${user.rating})`,
            );
          } else {
            console.warn(
              `Socket ${socket.id}: JWT user ID ${decoded.userId} not found in DB.`,
            );
          }
        } catch (err: any) {
          console.warn(
            `Socket ${socket.id} cookie authentication failed: ${err.message}.`,
          );
        }
      } else {
        /* console.log(`Socket ${socket.id} connected, no ${TOKEN_COOKIE_NAME} cookie found or JWT_SECRET missing.`); */
      }
    } else {
      /* console.log(`Socket ${socket.id} connected without cookies header.`); */
    }
    next();
  });

  io.on("connection", (socket: Socket) => {
    /* Your existing full io.on("connection") block */
    console.log(
      `Socket connected: ${socket.id}${socket.data.authUser ? " (Auth: " + socket.data.authUser.username + ")" : " (Unauthenticated)"}`,
    );

    let currentDuelId: string | null = null;
    // let currentUserIdForDuel: string | null = null; // Marked as unused, can be removed if not needed later
    let currentTournamentHallId: string | null = null;

    socket.on(
      "joinDuel",
      async (data: {
        duelId: string;
        userId?: string;
        username?: string;
        initialCode?: string;
        initialLanguage?: string;
      }) => {
        let {
          duelId,
          userId: clientUserId,
          username: clientUsername,
          initialCode = "// Start coding...",
          initialLanguage = "cpp",
        } = data;
        let effectiveUserId: string;
        let effectiveUsername: string;

        if (socket.data.authUser) {
          effectiveUserId = socket.data.authUser.userId;
          effectiveUsername = socket.data.authUser.username;
        } else if (clientUserId && clientUsername) {
          // Fallback for unauthed socket join (e.g. spectator not logged in)
          effectiveUserId = clientUserId;
          effectiveUsername = clientUsername;
          console.warn(
            `Duel join by unauthenticated socket ${socket.id} for user ${clientUsername}. This should ideally be an authenticated user.`,
          );
        } else {
          socket.emit("duelError", {
            message: "Cannot join duel without user identification.",
          });
          return;
        }

        if (currentDuelId && currentDuelId !== duelId) {
          socket.leave(currentDuelId);
          console.log(
            `Socket ${socket.id} left previous duel room ${currentDuelId}`,
          );
        }
        currentDuelId = duelId;
        // currentUserIdForDuel = effectiveUserId; // This was identified as unused previously.
        socket.join(duelId);
        console.log(
          `User ${effectiveUsername} (ID: ${effectiveUserId}, Socket: ${socket.id}) attempting to join duel ${duelId}`,
        );

        let room = activeDuels.get(duelId);
        if (!room) {
          room = {
            duelId,
            competitors: {},
            spectators: new Set(),
            status: "waiting",
          };
          activeDuels.set(duelId, room);
          console.log(`Created new duel room: ${duelId}`);
        }

        let assignedRole: UserRole | null = null;
        let competitorJustAddedToMakeTwo = false;
        let existingRole: CompetitorRole | null = null;

        if (room.competitors.competitor1?.userId === effectiveUserId)
          existingRole = "competitor1";
        else if (room.competitors.competitor2?.userId === effectiveUserId)
          existingRole = "competitor2";

        if (existingRole) {
          assignedRole = existingRole;
          if (room.competitors[assignedRole]) {
            room.competitors[assignedRole]!.socketId = socket.id;
            room.competitors[assignedRole]!.username = effectiveUsername; // Update username on rejoin
            console.log(
              `User ${effectiveUsername} rejoining duel ${duelId} as ${assignedRole}`,
            );
          }
        } else if (!room.competitors.competitor1) {
          assignedRole = "competitor1";
          room.competitors.competitor1 = {
            socketId: socket.id,
            userId: effectiveUserId,
            username: effectiveUsername,
            code: initialCode,
            language: initialLanguage,
            solvedProblem: false,
          };
          // competitorJustAddedToMakeTwo = Object.keys(room.competitors).length === 2; // Check after assignment
        } else if (!room.competitors.competitor2) {
          assignedRole = "competitor2";
          room.competitors.competitor2 = {
            socketId: socket.id,
            userId: effectiveUserId,
            username: effectiveUsername,
            code: initialCode,
            language: initialLanguage,
            solvedProblem: false,
          };
          competitorJustAddedToMakeTwo = true; // Now two competitors are definitely in
        } else {
          assignedRole = "spectator";
          room.spectators.add(socket.id);
        }

        if (
          assignedRole !== "spectator" &&
          room.competitors.competitor1 &&
          room.competitors.competitor2
        ) {
          competitorJustAddedToMakeTwo = true; // Re-evaluate if both slots filled now
        }

        socket.emit("assignedRole", {
          duelId,
          role: assignedRole,
          userId: effectiveUserId,
          username: effectiveUsername,
        });

        const competitorStatesForEmit: Array<{
          userId: string;
          username: string;
          role: CompetitorRole;
          code: string;
          language: string;
          solvedProblem?: boolean;
          submissionTime?: number;
        }> = [];

        if (room.competitors.competitor1) {
          competitorStatesForEmit.push({
            userId: room.competitors.competitor1.userId,
            username: room.competitors.competitor1.username,
            role: "competitor1",
            code: room.competitors.competitor1.code,
            language: room.competitors.competitor1.language,
            solvedProblem: room.competitors.competitor1.solvedProblem,
            submissionTime: room.competitors.competitor1.submissionTime,
            // socketId is internal to backend, not needed by frontend for this specific state object
          });
        }
        if (room.competitors.competitor2) {
          competitorStatesForEmit.push({
            userId: room.competitors.competitor2.userId,
            username: room.competitors.competitor2.username,
            role: "competitor2",
            code: room.competitors.competitor2.code,
            language: room.competitors.competitor2.language,
            solvedProblem: room.competitors.competitor2.solvedProblem,
            submissionTime: room.competitors.competitor2.submissionTime,
          });
        }

        socket.emit("duelState", {
          competitors: competitorStatesForEmit, // This now matches frontend's CompetitorState[]
          problem: room.problem,
          status: room.status,
        });

        // Notify others
        if (assignedRole !== "spectator") {
          // If a competitor joined/rejoined
          const joinedCompetitorData =
            room.competitors[assignedRole as CompetitorRole];
          if (joinedCompetitorData) {
            socket.to(duelId).emit("userJoined", {
              userId: joinedCompetitorData.userId,
              username: joinedCompetitorData.username,
              role: assignedRole,
            });
          }
        } else {
          // If a spectator joins
          // Spectator doesn't have a 'role' in the competitors list, but the 'userJoined' event sends their role as 'spectator'
          // We can send the effectiveUserId and effectiveUsername for the spectator
          io.to(duelId).emit("userJoined", {
            userId: effectiveUserId,
            username: effectiveUsername,
            role: assignedRole,
          });
        }
        console.log(
          `User ${effectiveUsername} (ID: ${effectiveUserId}) assigned role ${assignedRole} in duel ${duelId}`,
        );

        if (
          room.competitors.competitor1 &&
          room.competitors.competitor2 &&
          room.status === "waiting" &&
          (competitorJustAddedToMakeTwo || !room.problem)
        ) {
          console.log(
            `Duel ${duelId}: Two competitors ready (${room.competitors.competitor1.username} & ${room.competitors.competitor2.username}). Current problem: ${room.problem ? room.problem.title : "None"}. Status: ${room.status}. JustAdded: ${competitorJustAddedToMakeTwo}`,
          );
          room.status = "active";
          room.startTime = Date.now();
          io.to(duelId).emit("duelStatusUpdate", {
            status: room.status,
            startTime: room.startTime,
          });
          console.log(
            `Duel ${duelId} status set to active. Assigning problem...`,
          );
          try {
            let problemToAssign: TsProblem | null = null;
            if (room.tournamentId) {
              const tourneyDb = await prisma.tournament.findUnique({
                where: { id: room.tournamentId },
              });
              if (
                tourneyDb?.problemSetType === "CURATED" &&
                tourneyDb.curatedProblemIds.length > 0
              ) {
                const probId = tourneyDb.curatedProblemIds[0]; // Simplistic: pick first, or implement round logic
                console.log(
                  `Duel ${duelId}: Tournament duel, attempting to fetch curated problem: ${probId}`,
                );
                problemToAssign = await fetchLeetProblemDetails(probId).catch(
                  (err) => {
                    console.error(
                      "Error fetching curated LeetCode problem:",
                      err,
                    );
                    return null;
                  },
                );
              } else if (tourneyDb?.problemSetType === "RANDOM_CODEFORCES") {
                console.log(
                  `Duel ${duelId}: Tournament duel, fetching random Codeforces problem.`,
                );
                const cfProbs = await fetchCFProblems();
                if (cfProbs.length > 0)
                  problemToAssign =
                    cfProbs[Math.floor(Math.random() * cfProbs.length)];
              }
            }
            if (!problemToAssign) {
              // Default to random LeetCode if no tournament specific or CF fetch fails
              console.log(
                `Duel ${duelId}: No tournament problem set or failed fetch, fetching random LeetCode problem.`,
              );
              const stubs = await fetchLeetProblemStubs();
              if (stubs.length > 0) {
                const randomStub =
                  stubs[Math.floor(Math.random() * stubs.length)];
                problemToAssign = await fetchLeetProblemDetails(
                  randomStub.titleSlug,
                );
              }
            }

            if (problemToAssign) {
              room.problem = problemToAssign;
              console.log(
                `Duel ${duelId}: Assigned problem "${problemToAssign.title}"`,
              );
              io.to(duelId).emit("duelProblemAssigned", {
                problem: problemToAssign,
              });
            } else {
              console.error(`Duel ${duelId}: Failed to assign any problem.`);
              io.to(duelId).emit("duelError", {
                message: "Failed to assign a problem. No problems available.",
              });
            }
          } catch (error: any) {
            console.error(`Duel ${duelId}: Error assigning problem:`, error);
            io.to(duelId).emit("duelError", {
              message: "An error occurred while assigning problem.",
            });
          }
        } else if (room.problem) {
          // If problem already exists (e.g. user rejoining an active/finished duel)
          socket.emit("duelProblemAssigned", { problem: room.problem });
          socket.emit("duelStatusUpdate", {
            status: room.status,
            startTime: room.startTime,
            winner: room.winner,
          });
        }
      },
    );
    socket.on(
      "problemSolved",
      async (data: {
        duelId: string;
        userId: string;
        role: CompetitorRole;
        submissionTime: number;
      }) => {
        /* Copied */
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
        room.competitors[data.role]!.solvedProblem = true;
        room.competitors[data.role]!.submissionTime = data.submissionTime;
        console.log(
          `User ${room.competitors[data.role]?.username} (role ${data.role}) solved problem in duel ${data.duelId}`,
        );
        io.to(data.duelId).emit("competitorSolved", {
          userId: data.userId,
          role: data.role,
          submissionTime: data.submissionTime,
        });
        if (!room.winner) {
          // First solver wins
          room.winner = data.userId;
          room.status = "finished";
          console.log(
            `Duel ${data.duelId} finished. Winner: ${room.competitors[data.role]?.username}`,
          );
          io.to(data.duelId).emit("duelEnded", {
            winnerId: room.winner,
            status: room.status,
          });
          const c1 = room.competitors.competitor1;
          const c2 = room.competitors.competitor2;
          if (c1 && c2 && room.problem) {
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
                      : 0.5; // 0.5 for draw if implemented
                const { newRatingA: newRating1, newRatingB: newRating2 } =
                  calculateElo(user1.rating, user2.rating, score1);
                await prisma.user.update({
                  where: { id: c1.userId },
                  data: { rating: newRating1 },
                });
                await prisma.user.update({
                  where: { id: c2.userId },
                  data: { rating: newRating2 },
                });
                await prisma.duelMatch.create({
                  data: {
                    duelId: room.duelId,
                    problemTitle: room.problem.title,
                    problemPlatform: room.problem.platform,
                    playerOneId: c1.userId,
                    playerTwoId: c2.userId,
                    playerOneScore: score1,
                    playerTwoScore: 1.0 - score1,
                    playerOneOldRating: user1.rating,
                    playerOneNewRating: newRating1,
                    playerTwoOldRating: user2.rating,
                    playerTwoNewRating: newRating2,
                  },
                });
                console.log(
                  `Ratings updated for duel ${room.duelId}: ${user1.username} ${user1.rating}->${newRating1}, ${user2.username} ${user2.rating}->${newRating2}`,
                );
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
        /* Copied */
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
        /* Copied */
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
    socket.on(
      "joinHall",
      async (
        data: { tournamentId: string },
        callback: (response: {
          success: boolean;
          error?: string;
          tournamentDetails?: any;
        }) => void,
      ) => {
        /* Copied, with prisma.tournamentParticipant.aggregate for count */
        const { tournamentId } = data;
        const authUser = socket.data.authUser;
        if (!authUser) {
          if (callback)
            callback({ success: false, error: "Authentication required." });
          return;
        }
        const hall = activeHalls.get(tournamentId);
        const tournamentDb = await prisma.tournament.findUnique({
          where: { id: tournamentId },
          include: { organizer: { select: { id: true, username: true } } },
        });
        if (!hall || !tournamentDb) {
          if (callback)
            callback({ success: false, error: "Tournament hall not found." });
          return;
        }
        if (
          tournamentDb.status === TournamentStatus.COMPLETED ||
          tournamentDb.status === TournamentStatus.CANCELLED
        ) {
          if (callback)
            callback({ success: false, error: "Tournament not active." });
          return;
        }

        currentTournamentHallId = tournamentId; // Associate socket with this hall

        let participantDbRecord = await prisma.tournamentParticipant.findUnique(
          {
            where: {
              tournamentId_userId: { tournamentId, userId: authUser.userId },
            },
          },
        );
        if (
          !participantDbRecord &&
          tournamentDb.status === TournamentStatus.PENDING
        ) {
          if (tournamentDb.maxParticipants) {
            const countResult = await prisma.tournamentParticipant.aggregate({
              _count: { id: true },
              where: { tournamentId, isActive: true },
            });
            const count = countResult._count.id;
            if (count >= tournamentDb.maxParticipants) {
              if (callback)
                callback({ success: false, error: "Tournament is full." });
              return;
            }
          }
          try {
            participantDbRecord = await prisma.tournamentParticipant.create({
              data: { tournamentId, userId: authUser.userId },
            });
          } catch (e: any) {
            if (e.code === "P2002") {
              participantDbRecord =
                await prisma.tournamentParticipant.findUnique({
                  where: {
                    tournamentId_userId: {
                      tournamentId,
                      userId: authUser.userId,
                    },
                  },
                });
              if (!participantDbRecord) {
                if (callback)
                  callback({
                    success: false,
                    error: "Failed to join (conflict).",
                  });
                return;
              }
            } else {
              console.error("Error creating TP record:", e);
              if (callback)
                callback({ success: false, error: "Error joining." });
              return;
            }
          }
        } else if (
          !participantDbRecord &&
          tournamentDb.status !== TournamentStatus.PENDING
        ) {
          if (callback)
            callback({
              success: false,
              error: "Tournament already started/finished.",
            });
          return;
        }

        if (!participantDbRecord?.isActive) {
          if (callback)
            callback({ success: false, error: "Not an active participant." });
          return;
        }

        socket.join(tournamentId);
        const hallParticipant: HallParticipant = {
          socketId: socket.id,
          userId: authUser.userId,
          username: authUser.username,
          rating: authUser.rating,
        };
        hall.participants.set(authUser.userId, hallParticipant);

        const safeTournamentDetails = {
          ...tournamentDb,
          organizer: tournamentDb.organizer,
        }; // Organizer already selected safely
        socket.emit("hallState", {
          tournamentId,
          organizerId: hall.organizerId,
          participants: Array.from(hall.participants.values()),
          tournamentDetails: safeTournamentDetails,
        });
        io.to(tournamentId).emit("userJoinedHall", hallParticipant);
        if (callback)
          callback({ success: true, tournamentDetails: safeTournamentDetails });
      },
    );
    socket.on(
      "kickFromHall",
      async (data: { tournamentId: string; targetUserId: string }) => {
        /* Copied */
        const { tournamentId, targetUserId } = data;
        const hall = activeHalls.get(tournamentId);
        const tournamentDb = await prisma.tournament.findUnique({
          where: { id: tournamentId },
        });
        const initiatorAuthUser = socket.data.authUser;
        if (!hall || !tournamentDb || !initiatorAuthUser) {
          socket.emit("hallError", { message: "Invalid request." });
          return;
        }
        if (tournamentDb.organizerId !== initiatorAuthUser.userId) {
          socket.emit("hallError", { message: "Organizer only." });
          return;
        }
        if (targetUserId === initiatorAuthUser.userId) {
          socket.emit("hallError", { message: "Cannot kick self." });
          return;
        }
        const targetParticipant = hall.participants.get(targetUserId);
        if (targetParticipant) {
          hall.participants.delete(targetUserId);
          await prisma.tournamentParticipant.updateMany({
            where: { tournamentId, userId: targetUserId },
            data: { isActive: false },
          });
          const targetSocket = io.sockets.sockets.get(
            targetParticipant.socketId,
          );
          if (targetSocket) {
            targetSocket.emit("kickedFromHall", {
              tournamentId,
              reason: "Kicked by organizer.",
            });
            targetSocket.leave(tournamentId);
          }
          io.to(tournamentId).emit("userLeftHall", {
            userId: targetUserId,
            username: targetParticipant.username,
          });
          socket.emit("hallActionSuccess", {
            message: `User ${targetParticipant.username} kicked.`,
          });
        } else {
          socket.emit("hallError", { message: "Target user not in hall." });
        }
      },
    );
    socket.on(
      "startTournamentRound",
      async (data: { tournamentId: string }) => {
        /* Copied */
        const { tournamentId } = data;
        const hall = activeHalls.get(tournamentId);
        const tournamentDb = await prisma.tournament.findUnique({
          where: { id: tournamentId },
        });
        const initiatorAuthUser = socket.data.authUser;
        if (!hall || !tournamentDb || !initiatorAuthUser) {
          socket.emit("hallError", { message: "Invalid request." });
          return;
        }
        if (tournamentDb.organizerId !== initiatorAuthUser.userId) {
          socket.emit("hallError", { message: "Organizer only." });
          return;
        }
        if (
          tournamentDb.status !== TournamentStatus.PENDING &&
          tournamentDb.status !== TournamentStatus.ACTIVE
        ) {
          socket.emit("hallError", {
            message:
              "Tournament not in PENDING or ACTIVE state to start a new round.",
          });
          return;
        }
        if (
          hall.participants.size < 2 &&
          tournamentDb.pairingSystem === PairingSystem.RANDOM
        ) {
          socket.emit("hallError", {
            message: "Need at least 2 participants.",
          });
          return;
        }

        await prisma.tournament.update({
          where: { id: tournamentId },
          data: { status: TournamentStatus.ACTIVE },
        });
        io.to(tournamentId).emit("tournamentStatusUpdate", {
          status: TournamentStatus.ACTIVE,
        });

        let availableParticipants = Array.from(hall.participants.values()).sort(
          () => 0.5 - Math.random(),
        );
        const duelsToCreate = [];
        while (availableParticipants.length >= 2) {
          duelsToCreate.push({
            p1: availableParticipants.pop()!,
            p2: availableParticipants.pop()!,
          });
        }

        if (availableParticipants.length === 1) {
          const userWithBye = availableParticipants[0];
          const byeSocket = io.sockets.sockets.get(userWithBye.socketId);
          if (byeSocket) {
            byeSocket.emit("tournamentMessage", {
              message: "You have a bye this round.",
            });
          }
        }

        for (const pair of duelsToCreate) {
          const duelId = `tourney-${tournamentId.substring(0, 5)}-${pair.p1.userId.substring(0, 3)}v${pair.p2.userId.substring(0, 3)}-${Date.now() % 10000}`;
          // Set tournamentId when creating the duel room for tournament context
          activeDuels.set(duelId, {
            duelId,
            tournamentId,
            competitors: {},
            spectators: new Set(),
            status: "waiting",
          });
          console.log(
            `Tournament duel ${duelId} prepared for ${pair.p1.username} vs ${pair.p2.username}`,
          );
          const p1Socket = io.sockets.sockets.get(pair.p1.socketId);
          if (p1Socket)
            p1Socket.emit("duelInvitation", {
              duelId,
              opponentUsername: pair.p2.username,
              problemSetType: tournamentDb.problemSetType,
              curatedProblemIds: tournamentDb.curatedProblemIds,
            });
          const p2Socket = io.sockets.sockets.get(pair.p2.socketId);
          if (p2Socket)
            p2Socket.emit("duelInvitation", {
              duelId,
              opponentUsername: pair.p1.username,
              problemSetType: tournamentDb.problemSetType,
              curatedProblemIds: tournamentDb.curatedProblemIds,
            });
          io.to(tournamentId).emit("newTournamentDuel", {
            duelId,
            p1: { userId: pair.p1.userId, username: pair.p1.username },
            p2: { userId: pair.p2.userId, username: pair.p2.username },
          });
        }
        socket.emit("hallActionSuccess", {
          message: `Round started with ${duelsToCreate.length} duels.`,
        });
      },
    );
    socket.on("disconnect", () => {
      /* Your existing disconnect logic with currentDuelId & currentTournamentHallId */
      console.log(
        `Socket ${socket.id} disconnected.${socket.data.authUser ? " Auth user: " + socket.data.authUser.username : ""}`,
      );
      const authUser = socket.data.authUser;

      // Handle Tournament Hall Disconnect
      if (currentTournamentHallId && authUser) {
        // If socket was associated with a hall and was authenticated
        const hall = activeHalls.get(currentTournamentHallId);
        if (hall && hall.participants.has(authUser.userId)) {
          const participant = hall.participants.get(authUser.userId);
          // Ensure it's the same socket instance that's disconnecting for this user in this hall
          if (participant?.socketId === socket.id) {
            hall.participants.delete(authUser.userId);
            io.to(currentTournamentHallId).emit("userLeftHall", {
              userId: authUser.userId,
              username: authUser.username,
            });
            console.log(
              `User ${authUser.username} removed from hall ${currentTournamentHallId} due to disconnect.`,
            );
          }
        }
      }
      // currentTournamentHallId = null; // Resetting here could be problematic if user has multiple tabs/connections

      // Handle Duel Room Disconnect
      if (currentDuelId) {
        // If socket was associated with a duel
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
            if (competitor?.socketId === socket.id) {
              // Match by socket.id
              userWhoLeft = {
                userId: competitor.userId,
                username: competitor.username,
                role,
              };
              delete room.competitors[role];
              if (room.status === "active") {
                // If duel was active, other player wins by forfeit
                room.status = "finished";
                room.winner =
                  (role === "competitor1"
                    ? room.competitors.competitor2?.userId
                    : room.competitors.competitor1?.userId) || null;
                io.to(currentDuelId).emit("duelEnded", {
                  winnerId: room.winner,
                  status: room.status,
                  forfeitedBy: userWhoLeft.userId,
                });
                console.log(
                  `Duel ${currentDuelId} ended due to forfeit by ${userWhoLeft.username}`,
                );
              }
              break;
            }
          }

          if (room.spectators.has(socket.id)) {
            let spectatorUserId = `spectator-${socket.id}`;
            let spectatorUsername = "Spectator";
            if (authUser) {
              // If spectator was authenticated, use their details
              spectatorUserId = authUser.userId;
              spectatorUsername = authUser.username;
            }
            if (!userWhoLeft) {
              // Only set if not already identified as a leaving competitor
              userWhoLeft = {
                userId: spectatorUserId,
                username: spectatorUsername,
                role: "spectator",
              };
            }
            room.spectators.delete(socket.id);
          }

          if (userWhoLeft) {
            io.to(currentDuelId).emit("userLeft", userWhoLeft);
            console.log(
              `User ${userWhoLeft.username} (Role: ${userWhoLeft.role}) left duel ${currentDuelId}`,
            );
          }

          if (
            Object.keys(room.competitors).length === 0 &&
            room.spectators.size === 0
          ) {
            activeDuels.delete(currentDuelId);
            console.log(`Duel room ${currentDuelId} is now empty and removed.`);
          }
        }
      }
      // Do not nullify currentDuelId and currentTournamentHallId here globally for the socket,
      // as a user might be in a hall and then join a duel - those are distinct contexts for the socket.
      // These variables are more for tracking the *last* room of each type this socket interacted with for specific events.
      // The socket's actual room memberships are handled by socket.join/leave.
    });

    // WebRTC Signaling (from previous version)
    socket.on(
      "webrtcSignal",
      (payload: { to: string; data: any; duelId?: string }) => {
        io.to(payload.to).emit("webrtcSignal", {
          from: socket.id,
          data: payload.data,
          duelId: payload.duelId,
        });
      },
    );
    socket.on(
      "requestStreams",
      (data: { duelId: string; targetSocketIds: string[] }) => {
        data.targetSocketIds.forEach((targetSocketId) => {
          if (targetSocketId !== socket.id) {
            io.to(targetSocketId).emit("streamRequestedBySpectator", {
              spectatorSocketId: socket.id,
              duelId: data.duelId,
            });
          }
        });
      },
    );
  });

  const port = process.env.PORT || 4000;
  httpServer.listen(port, () => {
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
