import type { User } from "@supabase/supabase-js";
import { createContext } from "react";
import type { Perfil } from "../types";

export interface AuthContextValue {
  user: User | null;
  userData: Perfil | null;
  loading: boolean;
  authError: Error | null;
  refreshProfile: () => Promise<Perfil | null>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
