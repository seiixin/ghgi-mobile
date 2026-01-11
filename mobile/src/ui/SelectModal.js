// mobile/src/ui/SelectModal.js
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  FlatList,
} from "react-native";

function uniqSorted(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)))
    .sort((a, b) => String(a).localeCompare(String(b)));
}

export default function SelectModal({
  label,
  required = false,
  value,
  options,
  placeholder = "Select",
  disabled = false,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const cleanOptions = useMemo(() => uniqSorted(options || []), [options]);
  const filtered = useMemo(() => {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return cleanOptions;
    return cleanOptions.filter((x) => String(x).toLowerCase().includes(s));
  }, [q, cleanOptions]);

  const display = value ? String(value) : "";

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label} {required ? <Text style={styles.req}>*</Text> : null}
      </Text>

      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.box, disabled && styles.boxDisabled]}
      >
        <Text style={[styles.boxText, !display && styles.placeholder]}>
          {display || placeholder}
        </Text>
      </Pressable>

      <Text style={styles.hint}>
        Options: {cleanOptions.length}
      </Text>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} style={styles.closeBtn}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search..."
            style={styles.search}
            autoCorrect={false}
          />

          <FlatList
            data={filtered}
            keyExtractor={(it, idx) => `${it}-${idx}`}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange?.(item);
                  setOpen(false);
                  setQ("");
                }}
                style={styles.item}
              >
                <Text style={styles.itemText}>{String(item)}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No results</Text>
              </View>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: "800", color: "#111" },
  req: { color: "#dc2626" },

  box: {
    height: 48,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    paddingHorizontal: 12,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  boxDisabled: { opacity: 0.6, backgroundColor: "#f3f4f6" },
  boxText: { fontSize: 16, fontWeight: "900", color: "#111" },
  placeholder: { color: "#9ca3af" },

  hint: { fontSize: 12, color: "#6b7280" },

  modal: { flex: 1, backgroundColor: "#fff" },
  modalHeader: {
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#111" },
  closeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: "#ddd" },
  closeText: { fontWeight: "800" },

  search: {
    margin: 14,
    height: 44,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "#fafafa",
  },

  item: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  itemText: { fontSize: 14, fontWeight: "700", color: "#111" },

  empty: { padding: 18 },
  emptyText: { color: "#6b7280" },
});
