"use client";

/**
 * Session context.
 *
 * The session lives in one place: the browser store in `@/lib/session`, which is
 * read through `useSyncExternalStore` so the provider never copies it into
 * component state. A stored token is verified against `GET /api/auth/me` once
 * per token, and the verdict is keyed by that token so a new sign-in never
 * inherits the previous answer. Pages read the user from here; no page reads
 * storage directly.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { api } from "@/lib/api";
import { clearSession, readSession, subscribeSession, writeSession } from "@/lib/session";

const AuthContext = createContext(null);

// During server render and hydration there is no stored session to read, so the
// desk renders its "opening" state until the client takes over.
const getServerSession = () => undefined;

export function AuthProvider({ children }) {
  const session = useSyncExternalStore(subscribeSession, readSession, getServerSession);
  const [verification, setVerification] = useState({ token: null, state: "idle" });
  const token = session?.token ?? null;

  useEffect(() => {
    if (!token) return undefined;

    let active = true;

    api
      .get("/api/auth/me")
      .then((data) => {
        if (!active) return;
        writeSession({ token, user: data.user, organization: data.organization });
        setVerification({ token, state: "ok" });
      })
      .catch(() => {
        if (!active) return;
        clearSession();
        setVerification({ token, state: "failed" });
      });

    return () => {
      active = false;
    };
  }, [token]);

  const verified = verification.token === token ? verification.state : "pending";
  const status =
    session === undefined
      ? "loading"
      : !token
        ? "signed-out"
        : verified === "ok"
          ? "signed-in"
          : verified === "failed"
            ? "signed-out"
            : "loading";

  const signIn = useCallback(async (email, password) => {
    const result = await api.post("/api/auth/login", { email, password }, { auth: false });
    writeSession({ token: result.token, user: result.user, organization: result.organization });
    setVerification({ token: result.token, state: "ok" });
    return result;
  }, []);

  const register = useCallback(async ({ organizationName, name, email, password }) => {
    const result = await api.post(
      "/api/auth/register",
      { organizationName, name, email, password },
      { auth: false },
    );
    writeSession({ token: result.token, user: result.user, organization: result.organization });
    setVerification({ token: result.token, state: "ok" });
    return result;
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setVerification({ token: null, state: "idle" });
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    return api.post("/api/auth/password", { currentPassword, newPassword });
  }, []);

  const value = useMemo(
    () => ({
      status,
      user: session?.user ?? null,
      organization: session?.organization ?? null,
      isAdmin: ["OWNER", "ADMIN"].includes(session?.user?.role),
      signIn,
      register,
      signOut,
      changePassword,
    }),
    [status, session, signIn, register, signOut, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
