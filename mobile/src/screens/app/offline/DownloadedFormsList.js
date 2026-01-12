import React from "react";
import { View, Text } from "react-native";

export default function DownloadedFormsList({ forms = [] }) {
  return (
    <View>
      {forms.map(f => (
        <Text key={`${f.formTypeId}-${f.year}`}>
          Form {f.formTypeId} ({f.year})
        </Text>
      ))}
    </View>
  );
}
