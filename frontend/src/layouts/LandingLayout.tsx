import React from "react";
import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar"; // Adjust path if needed

export default function LandingLayout() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar />
      <main className="pt-4 px-4 md:px-8">
        {" "}
        {/* Add some padding */}
        <Outlet />
      </main>
    </div>
  );
}
