// frontend/src/main.tsx
import React from "react";
import { ApolloClient, InMemoryCache, ApolloProvider } from "@apollo/client";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
// AuthProvider should NOT be imported or used here directly if App.tsx handles routing and AuthProvider.
import "./index.css";

const client = new ApolloClient({
  uri: "http://localhost:4000/graphql", // Your GraphQL endpoint
  cache: new InMemoryCache(),
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ApolloProvider client={client}>
      {/* App component itself will now include AuthProvider and RouterProvider */}
      <App />
    </ApolloProvider>
  </React.StrictMode>,
);
