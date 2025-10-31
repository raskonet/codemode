import React from "react";
import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider,
  createHttpLink,
} from "@apollo/client";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const httpLink = createHttpLink({
  uri: "http://localhost:4000/graphql",
  credentials: "include",
});

const client = new ApolloClient({
  link: httpLink,
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
