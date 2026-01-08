import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import AuthStack from "./AuthStack";
import AppTabs from "./AppTabs";
import { apiMe } from "../lib/api";

export default function RootNavigation() {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await apiMe();
        setAuthed(true);
      } catch {
        setAuthed(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return null;

  return (
    <NavigationContainer>
      {authed ? <AppTabs onLogout={() => setAuthed(false)} /> : <AuthStack onAuthed={() => setAuthed(true)} />}
    </NavigationContainer>
  );
}
