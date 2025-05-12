// frontend/src/App.tsx
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./hooks/useAuth"; // IMPORT AuthProvider here

// Layouts
import LandingLayout from "./layouts/LandingLayout"; // Ensure this path is correct

// Pages
import HomePage from "./pages/HomePage";
import CompetePage from "./pages/CompetePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ProblemsPage from "./pages/ProblemsPage"; // Assuming these exist with default exports
import RankingsPage from "./pages/RankingsPage";
import ProfilePage from "./pages/ProfilePage";

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
        <Route path="user/:userId" element={<ProfilePage />} />
        <Route path="user" element={<ProfilePage />} />{" "}
        {/* Or a specific current user profile component */}
      </Route>,
    ),
  );

  return (
    // AuthProvider wraps RouterProvider.
    // This makes the router context available to useNavigate() calls within AuthContext's functions.
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster />
    </AuthProvider>
  );
}

export default App;
