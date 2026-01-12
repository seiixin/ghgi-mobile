// mobile/src/ui/SchemaFormRenderer.js
import React, { useMemo } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";

/**
 * Robust, offline-only renderer.
 * - Supports schema shapes:
 *   - { fields: [...] }
 *   - { schema: { fields: [...] } }
 *   - { form: { fields: [...] } }
 *   - { sections: [{ fields: [...] }] }
 *   - JSON Schema: { properties: { key: { type, enum, title } } }
 * - Field key fallbacks: key | name | id | field_key | fieldKey | code
 * - Select options from:
 *   - field.options (array)
 *   - mappingJson[option_key] OR mappingJson.options[option_key]
 */

function normalizeJson(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === "object" ? p : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

function getFieldKey(field, index) {
  const k =
    field?.key ??
    field?.name ??
    field?.field_key ??
    field?.fieldKey ??
    field?.code ??
    field?.id;

  const s = String(k ?? "").trim();
  return s ? s : `field_${index}`;
}

function getFieldLabel(field, fallbackKey) {
  const s = String(field?.label ?? field?.title ?? field?.name ?? "").trim();
  return s ? s : fallbackKey;
}

function coerceType(field) {
  const t = String(field?.type ?? field?.field_type ?? field?.fieldType ?? "").trim().toLowerCase();
  return t || "text";
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function flattenSections(sections) {
  const out = [];
  for (const s of safeArray(sections)) {
    for (const f of safeArray(s?.fields)) out.push(f);
  }
  return out;
}

function jsonSchemaToFields(schema) {
  const props = schema?.properties;
  if (!props || typeof props !== "object") return [];

  const out = [];
  for (const [key, def] of Object.entries(props)) {
    const type = String(def?.type ?? "text").toLowerCase();
    const label = String(def?.title ?? key);
    const required = Array.isArray(schema?.required) ? schema.required.includes(key) : false;

    // JSON schema enum => treat as select
    const enumVals = Array.isArray(def?.enum) ? def.enum : null;

    out.push({
      key,
      label,
      required,
      type: enumVals ? "select" : type === "integer" || type === "number" ? "number" : "text",
      options: enumVals || undefined,
    });
  }
  return out;
}

function extractFields(schemaJsonRaw) {
  const sj = normalizeJson(schemaJsonRaw);
  if (!sj) return [];

  // Common shapes
  const direct = safeArray(sj?.fields);
  if (direct.length) return direct;

  const nested1 = safeArray(sj?.schema?.fields);
  if (nested1.length) return nested1;

  const nested2 = safeArray(sj?.form?.fields);
  if (nested2.length) return nested2;

  const fromSections = flattenSections(sj?.sections);
  if (fromSections.length) return fromSections;

  // JSON Schema fallback
  const asJsonSchema = jsonSchemaToFields(sj);
  if (asJsonSchema.length) return asJsonSchema;

  return [];
}

function normalizeOptions(raw) {
  // Accept:
  // - ["A","B"]
  // - [{key,label}] / [{value,label}] / [{id,name}] etc
  const arr = safeArray(raw);
  const out = [];

  for (const it of arr) {
    if (it === null || it === undefined) continue;

    if (typeof it === "string" || typeof it === "number" || typeof it === "boolean") {
      const v = String(it);
      out.push({ key: v, label: v });
      continue;
    }

    if (typeof it === "object") {
      const key =
        it?.key ??
        it?.value ??
        it?.id ??
        it?.code ??
        it?.name ??
        it?.label;

      const label =
        it?.label ??
        it?.name ??
        it?.title ??
        it?.value ??
        it?.key ??
        it?.id ??
        it?.code;

      const ks = String(key ?? "").trim();
      const ls = String(label ?? "").trim();

      if (ks) out.push({ key: ks, label: ls || ks });
    }
  }

  return out;
}

function optionsForField(field, mappingJson) {
  const explicit = normalizeOptions(field?.options);
  if (explicit.length) return explicit;

  const optionKey = String(field?.option_key ?? field?.optionKey ?? "").trim();
  if (!optionKey) return [];

  const mj = normalizeJson(mappingJson) || {};
  const bucket = mj?.[optionKey] ?? mj?.options?.[optionKey] ?? mj?.mappings?.[optionKey];
  return normalizeOptions(bucket);
}

function toSnapshot(field, selectedValue, selectedLabelMaybe) {
  const type = coerceType(field);
  const snap = {
    label: getFieldLabel(field, field?.key || ""),
    type,
  };

  if (type === "select" || type === "radio" || type === "multiple_choice") {
    if (selectedValue !== undefined && selectedValue !== null) {
      snap.option_key = String(selectedValue);
      snap.option_label = String(selectedLabelMaybe ?? selectedValue);
    }
  }

  return snap;
}

function FieldRow({ field, fieldKey, value, onChange, mappingJson }) {
  const type = coerceType(field);
  const label = getFieldLabel(field, fieldKey);
  const required = !!field?.required;

  const isChoice = type === "select" || type === "radio" || type === "multiple_choice";
  const options = isChoice ? optionsForField(field, mappingJson) : [];

  if (isChoice) {
    const currentKey = value === null || value === undefined ? "" : String(value);
    const idx = options.findIndex((o) => String(o.key) === String(currentKey));

    const next = () => {
      if (!options.length) return "";
      const n = idx === -1 ? options[0] : options[(idx + 1) % options.length];
      return n?.key ?? "";
    };

    const currentLabel =
      idx >= 0 ? options[idx]?.label : currentKey ? currentKey : "";

    return (
      <View style={styles.row}>
        <Text style={styles.label}>
          {label} {required ? <Text style={styles.req}>*</Text> : null}
        </Text>

        <Text style={styles.selectValue} onPress={() => onChange(next(), options)}>
          {currentLabel
            ? String(currentLabel)
            : options.length
            ? "Tap to select"
            : "No options"}
        </Text>

        {!!options.length && (
          <Text style={styles.hint}>Options: {options.length} (tap to cycle)</Text>
        )}
        {!options.length && (
          <Text style={styles.hintMuted}>
            Missing options for this field (check option_key + mapping_json).
          </Text>
        )}
      </View>
    );
  }

  const keyboardType = type === "number" ? "numeric" : "default";
  const placeholder = String(field?.placeholder ?? "").trim();

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

export default function SchemaFormRenderer({
  schemaJson,
  mappingJson,
  answers,
  onChangeAnswers,
  snapshots,
  onChangeSnapshots,
}) {
  const fields = useMemo(() => extractFields(schemaJson), [schemaJson]);

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Form Fields</Text>

      {!fields.length ? (
        <Text style={styles.empty}>
          No schema fields found. (Schema shape may not match expected format.)
        </Text>
      ) : null}

      {fields.map((rawField, index) => {
        const fieldKey = getFieldKey(rawField, index);
        const value = answers?.[fieldKey];

        return (
          <FieldRow
            key={fieldKey}
            field={rawField}
            fieldKey={fieldKey}
            value={value}
            mappingJson={mappingJson}
            onChange={(newVal, optionsMaybe) => {
              const nextAnswers = { ...(answers || {}), [fieldKey]: newVal };
              onChangeAnswers?.(nextAnswers);

              // for choice fields, resolve label from options if available
              let label = null;
              if (Array.isArray(optionsMaybe)) {
                const hit = optionsMaybe.find((o) => String(o.key) === String(newVal));
                if (hit?.label) label = hit.label;
              }

              const nextSnap = toSnapshot(rawField, newVal, label);
              const nextSnapshots = { ...(snapshots || {}), [fieldKey]: nextSnap };
              onChangeSnapshots?.(nextSnapshots);
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 14,
    padding: 12,
    gap: 12,
    backgroundColor: "#fff",
  },
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
  hintMuted: { fontSize: 11, color: "#9ca3af" },
});
