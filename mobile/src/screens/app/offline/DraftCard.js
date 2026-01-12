import React from "react";
import { View, Text, Button } from "react-native";

export default function DraftCard({ draft, onOpen, onDelete }) {
  return (
    <View>
      <Text>Draft: {draft.formTypeId} ({draft.year})</Text>
      <Button title="Open" onPress={() => onOpen?.(draft)} />
      <Button title="Delete" onPress={() => onDelete?.(draft.draftId)} />
    </View>
  );
}
