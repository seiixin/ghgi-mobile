import React from "react";
import { View, Text } from "react-native";

export default function DownloadedFormCard({ form }) {
  return (
    <View>
      <Text>Form {form.formTypeId} - {form.year}</Text>
    </View>
  );
}
