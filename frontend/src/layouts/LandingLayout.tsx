import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";

export default function LandingLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-gray-850 to-gray-900 text-gray-100">
      <Navbar />
      <main className="flex-grow pt-6 pb-12 px-4 md:px-8">
        <Outlet />
      </main>
      <footer className="text-center py-4 bg-gray-800/50 text-xs text-gray-500 border-t border-gray-700/50">
        Coding Duels Arena © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
