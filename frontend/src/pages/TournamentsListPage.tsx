// frontend/src/pages/TournamentsListPage.tsx
import React from "react";
import { gql, useQuery } from "@apollo/client";
import { Link } from "react-router-dom";
import { Loader2, Trophy, Users, CalendarDays, PlayCircle } from "lucide-react";

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
      # participants { # If you want to show current participant count
      #   user { id }
      # }
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
  status: string; // Matches GQL TournamentStatus enum
  organizer: TournamentOrganizer;
  maxParticipants?: number | null;
  createdAt: string;
  // participants?: Array<{ user: {id: string}}>; // For participant count
}

interface ListTournamentsData {
  listTournaments: TournamentStub[];
}

export default function TournamentsListPage() {
  // Fetch PENDING or ACTIVE tournaments. Or fetch all and filter client-side.
  // For now, backend filters to PENDING and ACTIVE by default if no status arg.
  const { data, loading, error, refetch } = useQuery<ListTournamentsData>(
    LIST_TOURNAMENTS_QUERY,
  );

  if (loading) {
    return (
      <div className="text-center p-10 text-white">
        <Loader2 className="h-12 w-12 animate-spin mx-auto text-sky-400" />
        <p className="mt-2">Loading tournaments...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center p-10 text-red-400">
        Error loading tournaments: {error.message}
      </div>
    );
  }

  const tournaments = data?.listTournaments || [];

  return (
    <div className="container mx-auto px-4 py-8 text-white">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-sky-400">Tournaments</h1>
        <Link
          to="/tournaments/create"
          className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors"
        >
          Create New Tournament
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <div className="text-center text-gray-400 py-10">
          <Trophy size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl">No active or upcoming tournaments found.</p>
          <p>
            Why not{" "}
            <Link
              to="/tournaments/create"
              className="text-sky-400 hover:underline"
            >
              create one
            </Link>
            ?
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((tournament) => (
            <div
              key={tournament.id}
              className="bg-gray-800 p-6 rounded-xl shadow-lg flex flex-col justify-between hover:shadow-sky-500/20 transition-shadow"
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h2 className="text-2xl font-semibold text-green-400 mb-1">
                    {tournament.name}
                  </h2>
                  <span
                    className={`px-3 py-1 text-xs font-semibold rounded-full
                        ${tournament.status === "PENDING" ? "bg-yellow-500/20 text-yellow-300" : ""}
                        ${tournament.status === "ACTIVE" ? "bg-blue-500/20 text-blue-300" : ""}
                        ${tournament.status === "COMPLETED" ? "bg-gray-600/20 text-gray-400" : ""}
                    `}
                  >
                    {tournament.status}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mb-1 flex items-center">
                  <Users size={14} className="mr-2 opacity-70" /> Organizer:{" "}
                  {tournament.organizer.username}
                </p>
                {tournament.maxParticipants && (
                  <p className="text-sm text-gray-400 mb-1">
                    Max Participants: {tournament.maxParticipants}
                  </p>
                )}
                <p className="text-sm text-gray-400 mb-3 flex items-center">
                  <CalendarDays size={14} className="mr-2 opacity-70" />{" "}
                  Created: {new Date(tournament.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Link
                to={`/hall/${tournament.id}`}
                className="block w-full mt-auto text-center bg-sky-600 hover:bg-sky-700 text-white font-medium py-2.5 px-4 rounded-md transition-colors flex items-center justify-center"
              >
                <PlayCircle size={18} className="mr-2" /> View Hall
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
