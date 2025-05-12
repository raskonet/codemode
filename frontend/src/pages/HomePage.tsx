import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth"; // Adjust path if needed

export default function HomePage() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white flex flex-col items-center justify-center p-8">
      <header className="text-center mb-12">
        <h1 className="text-5xl md:text-7xl font-bold mb-4 animate-fade-in-down">
          Coding Duels Arena
        </h1>
        <p className="text-xl md:text-2xl text-gray-300 mb-8 animate-fade-in-up delay-200">
          Challenge friends, conquer problems, rise to the top.
        </p>
        {isAuthenticated ? (
          <p className="text-lg text-sky-400">
            Welcome back, {user?.username}!
          </p>
        ) : null}
      </header>

      <main className="flex flex-col md:flex-row gap-6 mb-12">
        <Link
          to="/compete"
          className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 px-8 rounded-lg text-lg shadow-lg transform hover:scale-105 transition-transform duration-150 ease-in-out animate-fade-in delay-400"
        >
          Enter a Duel
        </Link>
        <Link
          to="/problems" // Assuming you'll have a problems page
          className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-8 rounded-lg text-lg shadow-lg transform hover:scale-105 transition-transform duration-150 ease-in-out animate-fade-in delay-500"
        >
          Browse Problems
        </Link>
      </main>

      <section className="w-full max-w-4xl text-center mb-12">
        <h2 className="text-3xl font-semibold mb-6 text-gray-100 animate-fade-in delay-600">
          Why Duel with Us?
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-gray-800 p-6 rounded-xl shadow-xl transform hover:shadow-sky-500/30 transition-shadow duration-300 animate-fade-in-up delay-700">
            <h3 className="text-xl font-bold text-sky-400 mb-2">
              Live Coding Arena
            </h3>
            <p className="text-gray-400">
              Compete head-to-head in real-time solving the same challenges.
            </p>
          </div>
          <div className="bg-gray-800 p-6 rounded-xl shadow-xl transform hover:shadow-sky-500/30 transition-shadow duration-300 animate-fade-in-up delay-800">
            <h3 className="text-xl font-bold text-sky-400 mb-2">
              Spectator Mode
            </h3>
            <p className="text-gray-400">
              Watch duels unfold, learn from the best, and cheer on competitors.
            </p>
          </div>
          <div className="bg-gray-800 p-6 rounded-xl shadow-xl transform hover:shadow-sky-500/30 transition-shadow duration-300 animate-fade-in-up delay-900">
            <h3 className="text-xl font-bold text-sky-400 mb-2">
              Multiple Languages
            </h3>
            <p className="text-gray-400">
              Submit solutions in Java, C++, and Python. More to come!
            </p>
          </div>
        </div>
      </section>

      {!isAuthenticated && (
        <footer className="animate-fade-in delay-1000">
          <Link
            to="/signup"
            className="bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-8 rounded-lg text-lg shadow-lg transform hover:scale-105 transition-transform duration-150 ease-in-out"
          >
            Sign Up Now & Join the Fun!
          </Link>
        </footer>
      )}
      <style jsx global>{`
        .delay-200 {
          animation-delay: 0.2s;
        }
        .delay-400 {
          animation-delay: 0.4s;
        }
        .delay-500 {
          animation-delay: 0.5s;
        }
        .delay-600 {
          animation-delay: 0.6s;
        }
        .delay-700 {
          animation-delay: 0.7s;
        }
        .delay-800 {
          animation-delay: 0.8s;
        }
        .delay-900 {
          animation-delay: 0.9s;
        }
        .delay-1000 {
          animation-delay: 1s;
        }

        @keyframes fade-in-down {
          0% {
            opacity: 0;
            transform: translateY(-20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-down {
          animation: fade-in-down 0.5s ease-out forwards;
        }

        @keyframes fade-in-up {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.5s ease-out forwards;
        }

        @keyframes fade-in {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
