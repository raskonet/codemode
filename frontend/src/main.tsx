// frontend/src/main.tsx
import React from "react";
import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider,
  createHttpLink,
} from "@apollo/client"; // Added createHttpLink
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { AuthProvider } from "./contexts/AuthContext"; // Assuming App.tsx wraps with this
import "./index.css";

// Create an HTTP link that includes credentials
const httpLink = createHttpLink({
  uri: "http://localhost:4000/graphql",
  credentials: "include", // <<< THIS IS THE CRUCIAL PART
});

const client = new ApolloClient({
  link: httpLink, // Use the configured link
  cache: new InMemoryCache(),
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ApolloProvider client={client}>
      {/* Assuming App.tsx handles AuthProvider and RouterProvider correctly now */}
      <App />
    </ApolloProvider>
  </React.StrictMode>,
);
