import  {
  createContext,
  useState,
  type ReactNode,
  useEffect,
  useCallback,
} from "react";
// import { useNavigate } from "react-router-dom";
import { useApolloClient, gql } from "@apollo/client";

const ME_QUERY = gql`
  query Me {
    me {
      id
      username
      email
      rating
      createdAt
    }
  }
`;
const SIGNUP_MUTATION = gql`
  mutation Signup($username: String!, $email: String!, $password: String!) {
    signup(username: $username, email: $email, password: $password) {
      token
      user {
        id
        username
        email
        rating
        createdAt
      }
    }
  }
`;
const LOGIN_MUTATION = gql`
  mutation Login($emailOrUsername: String!, $password: String!) {
    login(emailOrUsername: $emailOrUsername, password: $password) {
      token
      user {
        id
        username
        email
        rating
        createdAt
      }
    }
  }
`;
const LOGOUT_MUTATION = gql`
  mutation Logout {
    logout
  }
`;

export interface User {
  id: string;
  username: string;
  email: string;
  rating: number;
  createdAt: string;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  loginUser: (vars: {
    emailOrUsername: string;
    password: string;
  }) => Promise<User | null>;
  signupUser: (vars: {
    username: string;
    email: string;
    password: string;
  }) => Promise<User | null>;
  logoutUser: () => Promise<boolean>; // Returns true on success
  isLoadingAuth: boolean;
  authError: string | null;
  fetchCurrentUser: () => Promise<void>; // Expose fetchCurrentUser
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const client = useApolloClient();
  // const navigate = useNavigate(); 

  const fetchCurrentUser = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const { data, errors } = await client.query({
        query: ME_QUERY,
        fetchPolicy: "network-only",
      });
      if (errors) {
        console.warn("GQL errors fetching current user:", errors);
        setUser(null);
      } else if (data && data.me) {
        setUser(data.me);
      } else {
        setUser(null);
      }
    } catch (error: any) {
      console.error(
        "Network/other error fetching current user:",
        error.message,
      );
      setUser(null);
    } finally {
      setIsLoadingAuth(false);
    }
  }, [client]);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const loginUser = async (variables: {
    emailOrUsername: string;
    password: string;
  }): Promise<User | null> => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const { data, errors } = await client.mutate({
        mutation: LOGIN_MUTATION,
        variables,
      });
      if (errors) {
        const errorMsg = errors.map((e) => e.message).join(", ");
        setAuthError(errorMsg);
        return null;
      }
      if (data && data.login && data.login.user) {
        setUser(data.login.user);
        return data.login.user;
      }
    } catch (error: any) {
      setAuthError(error.message || "Login failed.");
    } finally {
      setIsLoadingAuth(false);
    }
    return null;
  };

  const signupUser = async (variables: {
    username: string;
    email: string;
    password: string;
  }): Promise<User | null> => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const { data, errors } = await client.mutate({
        mutation: SIGNUP_MUTATION,
        variables,
      });
      if (errors) {
        const errorMsg = errors.map((e) => e.message).join(", ");
        setAuthError(errorMsg);
        return null;
      }
      if (data && data.signup && data.signup.user) {
        setUser(data.signup.user);
        // The component calling signupUser will handle navigation.
        return data.signup.user;
      }
    } catch (error: any) {
      setAuthError(error.message || "Signup failed.");
    } finally {
      setIsLoadingAuth(false);
    }
    return null;
  };

  const logoutUser = async (): Promise<boolean> => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      await client.mutate({ mutation: LOGOUT_MUTATION });
      setUser(null);
      // The component calling logoutUser will handle navigation.
      return true;
    } catch (error: any) {
      setAuthError(error.message || "Logout failed.");
      setUser(null); // Still clear user state on client even if backend logout fails
      return false;
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        loginUser,
        signupUser,
        logoutUser,
        isLoadingAuth,
        authError,
        fetchCurrentUser, // Expose this if needed by other parts of app, e.g. after token refresh
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
