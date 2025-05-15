import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Swords, ListChecks, User, Trophy, Zap } from "lucide-react";

export default function HomePage() {
  const { isAuthenticated, user } = useAuth();

  const featureCards = [
    {
      icon: <Swords size={32} className="text-sky-400 mb-3" />,
      title: "Live Coding Duels",
      description:
        "Challenge peers in real-time, solving identical problems under pressure. Test your speed and accuracy.",
    },
    {
      icon: <ListChecks size={32} className="text-green-400 mb-3" />,
      title: "Diverse Problem Sets",
      description:
        "Tackle problems from LeetCode, Codeforces, or curated lists. Sharpen skills across various domains.",
    },
    {
      icon: <Trophy size={32} className="text-yellow-400 mb-3" />,
      title: "Tournament Mode",
      description:
        "Organize or join tournaments. Compete through rounds, climb the bracket, and claim victory.",
    },
  ];

  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col items-center justify-center p-6 md:p-8">
      <header className="text-center mb-10 md:mb-16">
        <h1 className="text-5xl md:text-7xl font-extrabold mb-4 animate-fade-in-down bg-clip-text text-transparent bg-gradient-to-r from-sky-400 via-blue-400 to-purple-500">
          Coding Duels Arena
        </h1>
        <p className="text-xl md:text-2xl text-gray-300 mb-8 animate-fade-in-up delay-200 max-w-2xl mx-auto">
          The ultimate platform to challenge friends, conquer algorithmic
          problems, and rise through the ranks.
        </p>
        {isAuthenticated && user && (
          <p className="text-lg text-sky-300 animate-fade-in delay-400">
            Welcome back, <span className="font-semibold">{user.username}</span>
            ! Ready to duel?
          </p>
        )}
      </header>

      <main className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 mb-12 md:mb-16">
        <Link
          to="/compete"
          className="btn btn-primary text-lg shadow-xl transform hover:scale-105 w-full sm:w-auto animate-fade-in delay-500 flex items-center justify-center"
        >
          <Swords size={20} className="mr-2.5" /> Enter a Duel
        </Link>
        <Link
          to="/tournaments"
          className="btn btn-secondary text-lg shadow-xl transform hover:scale-105 w-full sm:w-auto animate-fade-in delay-600 flex items-center justify-center"
        >
          <Trophy size={20} className="mr-2.5" /> Browse Tournaments
        </Link>
      </main>

      <section className="w-full max-w-5xl text-center mb-10 md:mb-16">
        <h2 className="text-3xl md:text-4xl font-semibold mb-8 text-gray-100 animate-fade-in delay-700">
          Why <span className="text-sky-400">Duel</span> with Us?
        </h2>
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {featureCards.map((feature, index) => (
            <div
              key={index}
              className="card bg-gray-800/70 p-6 rounded-xl shadow-xl hover:shadow-purple-500/20 transition-all duration-300 transform hover:-translate-y-1.5 animate-fade-in-up"
              style={{ animationDelay: `${0.8 + index * 0.1}s` }}
            >
              {feature.icon}
              <h3 className="text-xl font-bold text-gray-100 mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {!isAuthenticated && (
        <footer className="animate-fade-in" style={{ animationDelay: "1.2s" }}>
          <Link
            to="/signup"
            className="btn btn-success text-lg shadow-xl transform hover:scale-105 flex items-center justify-center"
          >
            <User size={20} className="mr-2.5" /> Sign Up & Unleash Your Skills!
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
        @keyframes fade-in-down {
          0% {
            opacity: 0;
            transform: translateY(-25px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-down {
          animation: fade-in-down 0.6s ease-out forwards;
        }
        @keyframes fade-in-up {
          0% {
            opacity: 0;
            transform: translateY(25px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out forwards;
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
          animation: fade-in 0.6s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
