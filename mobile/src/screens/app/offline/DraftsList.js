import React from "react";
import { View } from "react-native";
import DraftCard from "./DraftCard";

export default function DraftsList({ drafts = [], onOpen, onDelete }) {
  return (
    <View>
      {drafts.map(d => (
        <DraftCard
          key={d.draftId}
          draft={d}
          onOpen={onOpen}
          onDelete={onDelete}
        />
      ))}
    </View>
  );
}
