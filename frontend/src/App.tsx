import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./contexts/AuthContext";

// Layouts
import LandingLayout from "./layouts/LandingLayout";

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

function App() {
  const router = createBrowserRouter(
    createRoutesFromElements(
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
        <Route path="user/:userId" element={<ProfilePage />} />
        <Route path="user" element={<ProfilePage />} />
      </Route>,
    ),
  );

  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster
        position="top-right"
        toastOptions={{
          className: "",
          style: {
            background: "#374151", // bg-gray-700
            color: "#F3F4F6", // text-gray-100
            border: "1px solid #4B5563", // border-gray-600
            boxShadow:
              "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)",
          },
          success: {
            iconTheme: {
              primary: "#34D399", // green-400
              secondary: "#F3F4F6",
            },
          },
          error: {
            iconTheme: {
              primary: "#F87171", // red-400
              secondary: "#F3F4F6",
            },
          },
        }}
      />
    </AuthProvider>
  );
}

export default App;
