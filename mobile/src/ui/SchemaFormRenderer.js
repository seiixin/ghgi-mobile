// mobile/src/ui/SchemaFormRenderer.js
import React, { useMemo } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";

function safeFields(schemaJson) {
  const fields = schemaJson?.fields;
  return Array.isArray(fields) ? fields : [];
}

function toSnapshot(field, selectedValue) {
  const type = field?.type || "text";
  const snap = {
    label: field?.label || field?.key || "",
    type,
  };
  if (type === "select" || type === "radio" || type === "multiple_choice") {
    if (selectedValue !== undefined && selectedValue !== null) {
      snap.option_key = String(selectedValue);
      // for your backend, option_label can be same as key unless you have key/label mapping
      snap.option_label = String(selectedValue);
    }
  }
  return snap;
}

function FieldRow({ field, value, onChange }) {
  const type = field?.type || "text";
  const label = field?.label || field?.key || "Field";
  const required = !!field?.required;
  const options = Array.isArray(field?.options) ? field.options : [];

  if (type === "select") {
    // dependency-free: tap-to-cycle options
    const current = value ?? "";
    const idx = options.findIndex((x) => String(x) === String(current));
    const next = () => {
      if (!options.length) return "";
      const n = idx === -1 ? options[0] : options[(idx + 1) % options.length];
      return n;
    };

    return (
      <View style={styles.row}>
        <Text style={styles.label}>
          {label} {required ? <Text style={styles.req}>*</Text> : null}
        </Text>
        <Text style={styles.selectValue} onPress={() => onChange(next())}>
          {current ? String(current) : options.length ? "Tap to select" : "No options"}
        </Text>
        {!!options.length && <Text style={styles.hint}>Options: {options.length} (tap to cycle)</Text>}
      </View>
    );
  }

  const keyboardType = type === "number" ? "numeric" : "default";
  const placeholder = field?.placeholder || "";

  return (
    <View style={styles.row}>
      <Text style={styles.label}>
        {label} {required ? <Text style={styles.req}>*</Text> : null}
      </Text>
      <TextInput
        style={styles.input}
        value={value === null || value === undefined ? "" : String(value)}
        onChangeText={(t) => onChange(type === "number" ? (t === "" ? "" : Number(t)) : t)}
        placeholder={placeholder}
        keyboardType={keyboardType}
      />
      {field?.help ? <Text style={styles.hint}>{String(field.help)}</Text> : null}
    </View>
  );
}

export default function SchemaFormRenderer({ schemaJson, answers, onChangeAnswers, snapshots, onChangeSnapshots }) {
  const fields = useMemo(() => safeFields(schemaJson), [schemaJson]);

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Form Fields</Text>
      {!fields.length ? (
        <Text style={styles.empty}>No schema fields found.</Text>
      ) : null}

      {fields.map((f) => {
        const key = f?.key;
        if (!key) return null;
        const value = answers?.[key];

        return (
          <FieldRow
            key={key}
            field={f}
            value={value}
            onChange={(newVal) => {
              onChangeAnswers({ ...(answers || {}), [key]: newVal });
              const snap = toSnapshot(f, newVal);
              onChangeSnapshots({ ...(snapshots || {}), [key]: snap });
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: "#eee", borderRadius: 14, padding: 12, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 14, fontWeight: "800", color: "#111" },
  empty: { fontSize: 12, color: "#666" },
  row: { gap: 6 },
  label: { fontSize: 12, color: "#666" },
  req: { color: "#dc2626", fontWeight: "900" },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: "#fafafa",
    color: "#111",
  },
  selectValue: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    backgroundColor: "#fafafa",
    color: "#111",
    fontWeight: "700",
  },
  hint: { fontSize: 11, color: "#888" },
});
