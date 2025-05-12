// frontend/src/App.tsx
import React from "react"; // Added React import for JSX if not implicitly available
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./contexts/AuthContext"; // Ensure path is correct

// Layouts
import LandingLayout from "./layouts/LandingLayout"; // Corrected import for LandingLayout

// Pages
import HomePage from "./pages/HomePage";
import CompetePage from "./pages/CompetePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ProblemsPage from "./pages/ProblemsPage";
import RankingsPage from "./pages/RankingsPage";
import ProfilePage from "./pages/ProfilePage";
import CreateTournamentPage from "./pages/CreateTournamentPage";
import TournamentsListPage from "./pages/TournamentsListPage";
import TournamentHallPage from "./pages/TournamentHallPage";

/*
const TournamentHallPage = () => (
  <div className="p-6 text-white bg-gray-850 min-h-screen">
    <h1 className="text-3xl font-bold text-sky-400">Tournament Hall</h1>
    <p className="mt-4 text-gray-300">
      This page is under construction. Hall details and participant list will
      appear here soon!
    </p>
    <p className="mt-2 text-sm text-gray-500">
      (Component: TournamentHallPage.tsx)
    </p>
  </div>
);
*/

function App() {
  const router = createBrowserRouter(
    createRoutesFromElements(
      // LandingLayout will contain the Navbar and an <Outlet /> for child routes
      <Route path="/" element={<LandingLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="compete/:duelId" element={<CompetePage />} />
        <Route path="compete" element={<CompetePage />} />
        <Route path="problems" element={<ProblemsPage />} />
        <Route path="rankings" element={<RankingsPage />} />
        <Route path="tournaments/create" element={<CreateTournamentPage />} />
        <Route path="tournaments" element={<TournamentsListPage />} />
        <Route path="hall/:tournamentId" element={<TournamentHallPage />} />
        {/* Using placeholder */}
        <Route path="user/:userId" element={<ProfilePage />} />
        <Route path="user" element={<ProfilePage />} />{" "}
        {/* Default user route, could be current user's profile */}
      </Route>,
    ),
  );

  return (
    // AuthProvider wraps RouterProvider to provide auth context to all routes
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster />
    </AuthProvider>
  );
}

export default App;
