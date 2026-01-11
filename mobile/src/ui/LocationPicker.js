// mobile/src/ui/LocationPicker.js
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import barangaysJson from "../data/laguna_barangays_list.json";
import municitiesJson from "../data/laguna_municities_list.json";
import SelectModal from "./SelectModal";

function normalizeRows(jsonObj) {
  const rows = jsonObj?.rows ?? jsonObj?.data?.rows ?? jsonObj?.data ?? [];
  return Array.isArray(rows) ? rows : [];
}

function uniqSorted(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)))
    .sort((a, b) => String(a).localeCompare(String(b)));
}

export default function LocationPicker({ value, onChange, strict = false }) {
  const munRows = useMemo(() => normalizeRows(municitiesJson), []);
  const brgyRows = useMemo(() => normalizeRows(barangaysJson), []);

  const regName = value?.reg_name || "";
  const provName = value?.prov_name || "";
  const cityName = value?.city_name || "";
  const brgyName = value?.brgy_name || "";

  const regionOptions = useMemo(() => {
    return uniqSorted(munRows.map((r) => r?.reg_name).filter(Boolean));
  }, [munRows]);

  const provinceOptions = useMemo(() => {
    return uniqSorted(munRows.map((r) => r?.prov_name).filter(Boolean));
  }, [munRows]);

  const cityOptions = useMemo(() => {
    const rows = munRows.filter((r) => {
      const okReg = !regName ? true : String(r?.reg_name) === String(regName);
      const okProv = !provName ? true : String(r?.prov_name) === String(provName);
      return okReg && okProv;
    });
    return uniqSorted(rows.map((r) => r?.city_name).filter(Boolean));
  }, [munRows, regName, provName]);

  const barangayOptions = useMemo(() => {
    if (!provName || !cityName) return [];
    const rows = brgyRows.filter(
      (r) => String(r?.prov_name) === String(provName) && String(r?.city_name) === String(cityName)
    );
    return uniqSorted(rows.map((r) => r?.brgy_name).filter(Boolean));
  }, [brgyRows, provName, cityName]);

  const missing = useMemo(() => {
    const m = [];
    if (!provName) m.push("prov_name");
    if (!cityName) m.push("city_name");
    if (strict && !brgyName) m.push("brgy_name");
    return m;
  }, [provName, cityName, brgyName, strict]);

  function patch(next) {
    onChange?.({
      reg_name: next.reg_name ?? regName,
      prov_name: next.prov_name ?? provName,
      city_name: next.city_name ?? cityName,
      brgy_name: next.brgy_name ?? brgyName,
    });
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Location</Text>

      {missing.length ? (
        <Text style={styles.warn}>Missing: {missing.join(", ")}</Text>
      ) : null}

      <SelectModal
        label="Region"
        required
        value={regName}
        options={regionOptions}
        placeholder="Select region"
        onChange={(v) => {
          // reset downstream
          patch({ reg_name: v, city_name: "", brgy_name: "" });
        }}
      />

      <SelectModal
        label="Province"
        required
        value={provName}
        options={provinceOptions}
        placeholder="Select province"
        onChange={(v) => {
          // reset downstream
          patch({ prov_name: v, city_name: "", brgy_name: "" });
        }}
      />

      <SelectModal
        label="City/Municipality"
        required
        value={cityName}
        options={cityOptions}
        placeholder={!regName || !provName ? "Select region & province first" : "Select city"}
        disabled={!regName || !provName}
        onChange={(v) => {
          patch({ city_name: v, brgy_name: "" });
        }}
      />

      <SelectModal
        label="Barangay"
        required
        value={brgyName}
        options={barangayOptions}
        placeholder={!provName || !cityName ? "Select city first" : "Select barangay"}
        disabled={!provName || !cityName}
        onChange={(v) => patch({ brgy_name: v })}
      />

      <Text style={styles.selected}>
        Selected:{" "}
        <Text style={styles.selectedBold}>
          {provName || "—"}
          {cityName ? `, ${cityName}` : ""}
          {brgyName ? `, ${brgyName}` : ""}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 16,
    padding: 14,
    gap: 12,
    backgroundColor: "#fff",
  },
  cardTitle: { fontSize: 16, fontWeight: "900", color: "#111" },
  warn: { color: "#b45309", fontWeight: "800" },
  selected: { fontSize: 12, color: "#6b7280" },
  selectedBold: { fontWeight: "900", color: "#111" },
});
