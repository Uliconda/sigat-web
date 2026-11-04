import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../config/supabase";
import { getProfile } from "../services/supabaseData";
import type { Perfil } from "../types";
import { AuthContext } from "./authContext";

const comoError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<Error | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!user) return null;
    setLoading(true);
    try {
      const profile = await getProfile(user.id);
      setUserData(profile);
      setAuthError(profile ? null : new Error("La cuenta no tiene un perfil SIGAT."));
      return profile;
    } catch (error) {
      setAuthError(comoError(error));
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    let profileRequest = 0;

    const applySession = (currentUser: User | null) => {
      setUser(currentUser);
      setUserData(null);
      setAuthError(null);

      if (!currentUser) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const requestId = ++profileRequest;
      setTimeout(async () => {
        try {
          const profile = await getProfile(currentUser.id);
          if (!active || requestId !== profileRequest) return;
          setUserData(profile);
          if (!profile) {
            setAuthError(new Error("La cuenta no tiene un perfil SIGAT."));
          }
        } catch (error) {
          if (!active || requestId !== profileRequest) return;
          console.error("Error al cargar el perfil de Supabase:", error);
          setAuthError(comoError(error));
        } finally {
          if (active && requestId === profileRequest) setLoading(false);
        }
      }, 0);
    };

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthError(comoError(error));
        setLoading(false);
        return;
      }
      applySession(data.session?.user ?? null);
    }).catch((error) => {
      if (!active) return;
      console.error("Error al verificar la sesión de Supabase:", error);
      setAuthError(comoError(error));
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      applySession(session?.user ?? null)
    );

    return () => {
      active = false;
      profileRequest += 1;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      userData,
      loading,
      authError,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
