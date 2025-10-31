import { gql, useQuery } from "@apollo/client";
import { Link } from "react-router-dom";
import {
  Loader2,
  Trophy,
  Users,
  CalendarDays,
  PlayCircle,
  PlusCircle,
  AlertTriangle,
} from "lucide-react";

const LIST_TOURNAMENTS_QUERY = gql`
  query ListTournaments($status: TournamentStatus) {
    listTournaments(status: $status) {
      id
      name
      status
      organizer {
        id
        username
      }
      maxParticipants
      createdAt
    }
  }
`;

interface TournamentOrganizer {
  id: string;
  username: string;
}
interface TournamentStub {
  id: string;
  name: string;
  status: string;
  organizer: TournamentOrganizer;
  maxParticipants?: number | null;
  createdAt: string;
}
interface ListTournamentsData {
  listTournaments: TournamentStub[];
}

export default function TournamentsListPage() {
  const { data, loading, error } = useQuery<ListTournamentsData>(
    LIST_TOURNAMENTS_QUERY,
  );

  if (loading) {
    return (
      <div className="text-center p-10">
        <Loader2 className="h-16 w-16 animate-spin mx-auto text-sky-400" />
        <p className="mt-3 text-lg text-gray-300">Loading Tournaments...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-[calc(100vh-120px)] flex flex-col items-center justify-center text-center p-4">
        <AlertTriangle size={60} className="mb-6 text-red-400" />
        <h2 className="text-3xl font-semibold mb-3 text-red-300">
          Failed to Load Tournaments
        </h2>
        <p className="text-gray-400 max-w-md">{error.message}</p>
        <p className="mt-6 text-sm text-gray-500">
          Please try refreshing or check back later.
        </p>
      </div>
    );
  }

  const tournaments = data?.listTournaments || [];
  const statusColors: Record<string, string> = {
    PENDING: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    ACTIVE: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    COMPLETED: "bg-gray-600/20 text-gray-400 border-gray-600/30",
    CANCELLED: "bg-red-600/20 text-red-400 border-red-600/30",
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-10 gap-4">
        <h1 className="text-4xl font-bold text-sky-400 flex items-center">
          <Trophy size={36} className="mr-3" /> Available Tournaments
        </h1>
        <Link
          to="/tournaments/create"
          className="btn btn-success flex items-center"
        >
          <PlusCircle size={20} className="mr-2" /> Create New Tournament
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <Trophy size={64} className="mx-auto mb-6 opacity-30" />
          <p className="text-2xl mb-2">No tournaments found.</p>
          <p className="text-gray-500">
            Be the first to host one!{" "}
            <Link
              to="/tournaments/create"
              className="text-sky-400 hover:underline font-semibold"
            >
              Create a tournament
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((tournament) => (
            <div
              key={tournament.id}
              className={`card card-hover flex flex-col justify-between border ${statusColors[tournament.status] || "border-gray-700"}`}
            >
              <div>
                <div className="flex justify-between items-start mb-2.5">
                  <h2 className="text-2xl font-semibold text-gray-100 hover:text-sky-300 transition-colors">
                    <Link to={`/hall/${tournament.id}`}>{tournament.name}</Link>
                  </h2>
                  <span
                    className={`px-3 py-1 text-xs font-semibold rounded-full ${statusColors[tournament.status] || "bg-gray-700 text-gray-300"}`}
                  >
                    {tournament.status}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mb-1.5 flex items-center">
                  <Users size={14} className="mr-2 opacity-70" /> Organizer:{" "}
                  <span className="text-gray-300 ml-1">
                    {tournament.organizer.username}
                  </span>
                </p>
                {tournament.maxParticipants && (
                  <p className="text-sm text-gray-400 mb-1.5">
                    Max Participants:{" "}
                    <span className="text-gray-300">
                      {tournament.maxParticipants}
                    </span>
                  </p>
                )}
                <p className="text-sm text-gray-400 mb-4 flex items-center">
                  <CalendarDays size={14} className="mr-2 opacity-70" />{" "}
                  Created:{" "}
                  <span className="text-gray-300 ml-1">
                    {new Date(tournament.createdAt).toLocaleDateString()}
                  </span>
                </p>
              </div>
              <Link
                to={`/hall/${tournament.id}`}
                className="btn btn-primary w-full mt-auto text-sm flex items-center justify-center"
              >
                <PlayCircle size={18} className="mr-2" /> View Hall & Join
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
