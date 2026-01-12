import React from "react";
import { enableScreens } from "react-native-screens";
import RootNavigation from "./src/navigation/RootNavigation";
import { installFetchDebug } from "./src/lib/debugFetch";

enableScreens(true);

export default function App() {
  return <RootNavigation />;
}

