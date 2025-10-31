import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Swords, ListChecks, User, Trophy, Sparkles } from "lucide-react";

export default function HomePage() {
  const { isAuthenticated, user } = useAuth();

  const featureCards = [
    {
      icon: (
        <Swords
          size={32}
          className="transition-transform duration-300 ease-in-out"
        />
      ),
      title: "Live Coding Duels",
      description:
        "Challenge peers in real-time, solving identical problems under pressure. Test your speed and accuracy.",
      iconColor: "text-sky-400",
      hoverIconContainerBg: "group-hover:bg-sky-500/20",
      hoverIconContainerBorder: "group-hover:border-sky-500/50",
      hoverCardBorder: "hover:border-sky-500/70 focus-within:border-sky-500/70",
      hoverCardShadow: "hover:shadow-sky-500/20 focus-within:shadow-sky-500/20",
    },
    {
      icon: (
        <ListChecks
          size={32}
          className="transition-transform duration-300 ease-in-out"
        />
      ),
      title: "Diverse Problem Sets",
      description:
        "Tackle problems from LeetCode, Codeforces, or curated lists. Sharpen skills across various domains.",
      iconColor: "text-green-400",
      hoverIconContainerBg: "group-hover:bg-green-500/20",
      hoverIconContainerBorder: "group-hover:border-green-500/50",
      hoverCardBorder:
        "hover:border-green-500/70 focus-within:border-green-500/70",
      hoverCardShadow:
        "hover:shadow-green-500/20 focus-within:shadow-green-500/20",
    },
    {
      icon: (
        <Trophy
          size={32}
          className="transition-transform duration-300 ease-in-out"
        />
      ),
      title: "Tournament Mode",
      description:
        "Organize or join tournaments. Compete through rounds, climb the bracket, and claim victory.",
      iconColor: "text-yellow-400",
      hoverIconContainerBg: "group-hover:bg-yellow-500/20",
      hoverIconContainerBorder: "group-hover:border-yellow-500/50",
      hoverCardBorder:
        "hover:border-yellow-500/70 focus-within:border-yellow-500/70",
      hoverCardShadow:
        "hover:shadow-yellow-500/20 focus-within:shadow-yellow-500/20",
    },
  ];

  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col items-center justify-center p-6 md:p-8 selection:bg-purple-500 selection:text-white">
      <header className="text-center mb-16 md:mb-20 relative">
        <Sparkles
          className="absolute -top-8 -left-8 md:-top-12 md:-left-12 text-purple-500/30 animate-pulse h-16 w-16 md:h-24 md:w-24"
          style={{ animationDuration: "3s" }}
        />
        <Sparkles
          className="absolute -bottom-8 -right-8 md:-bottom-12 md:-right-12 text-sky-500/30 animate-pulse h-12 w-12 md:h-20 md:w-20"
          style={{ animationDelay: "0.5s", animationDuration: "3s" }}
        />
        <h1 className="text-5xl md:text-7xl font-extrabold mb-6 animate-fade-in-down bg-clip-text text-transparent bg-gradient-to-r from-sky-400 via-blue-400 to-purple-500 tracking-tighter">
          Coding Duels Arena
        </h1>
        <p className="text-xl md:text-2xl text-gray-300 mb-10 animate-fade-in-up delay-200 max-w-3xl mx-auto leading-relaxed tracking-wide">
          The ultimate platform to challenge friends, conquer algorithmic
          problems, and rise through the ranks in electrifying head-to-head
          coding battles.
        </p>
        {isAuthenticated && user && (
          <p className="text-lg text-sky-300 animate-fade-in delay-400">
            Welcome back, <span className="font-semibold">{user.username}</span>
            ! Ready for your next duel?
          </p>
        )}
      </header>

      <main className="flex flex-col sm:flex-row items-center gap-5 md:gap-6 mb-20 md:mb-28">
        <Link
          to="/compete"
          className="btn btn-primary text-lg shadow-lg hover:shadow-xl focus:shadow-xl transform hover:scale-105 focus:scale-105 w-full sm:w-auto animate-fade-in delay-500 flex items-center justify-center py-3.5 px-10"
        >
          <Swords size={22} className="mr-3" /> Enter a Duel
        </Link>
        <Link
          to="/tournaments"
          className="btn btn-secondary text-lg shadow-lg hover:shadow-xl focus:shadow-xl transform hover:scale-105 focus:scale-105 w-full sm:w-auto animate-fade-in delay-600 flex items-center justify-center py-3.5 px-10"
        >
          <Trophy size={22} className="mr-3" /> Browse Tournaments
        </Link>
      </main>

      <section className="w-full max-w-6xl text-center mb-20 md:mb-28">
        <h2 className="text-3xl md:text-4xl font-semibold mb-12 text-gray-100 animate-fade-in delay-700">
          Why{" "}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-sky-400">
            Duel
          </span>{" "}
          with Us?
        </h2>
        <div className="grid md:grid-cols-3 gap-8 md:gap-10">
          {featureCards.map((feature, index) => (
            <div
              key={index}
              className={`group bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-700 
                         transition-all duration-300 transform hover:-translate-y-2 
                         animate-fade-in-up focus-within:-translate-y-2
                         ${feature.hoverCardBorder} ${feature.hoverCardShadow}`}
              style={{ animationDelay: `${0.8 + index * 0.15}s` }} // Stagger animation slightly more
              tabIndex={0}
            >
              <div
                className={`mb-6 inline-flex items-center justify-center p-4 bg-gray-700/70 rounded-xl border border-gray-600/70 
                               transition-all duration-300 ${feature.hoverIconContainerBg} ${feature.hoverIconContainerBorder} group-hover:shadow-md`}
              >
                {React.cloneElement(feature.icon, {
                  className: `${feature.iconColor} h-9 w-9 group-hover:scale-110 transition-transform duration-300`,
                })}
              </div>
              <h3 className="text-2xl font-bold text-gray-100 mb-3.5 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r ${feature.iconColor === 'text-sky-400' ? 'from-sky-400 to-blue-400' : feature.iconColor === 'text-green-400' ? 'from-green-400 to-emerald-400' : 'from-yellow-400 to-amber-400'} transition-colors duration-300">
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
        <footer className="animate-fade-in" style={{ animationDelay: "1.4s" }}>
          <Link
            to="/signup"
            className="btn btn-success text-lg shadow-lg hover:shadow-xl focus:shadow-xl transform hover:scale-105 focus:scale-105 flex items-center justify-center py-3.5 px-10"
          >
            <User size={22} className="mr-3" /> Sign Up & Unleash Your Skills!
          </Link>
        </footer>
      )}

    </div>
  );
}
