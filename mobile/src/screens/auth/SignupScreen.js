import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import AuthShell from "./AuthShell";
import { PillButton, Segmented } from "../../ui/components";
import { theme } from "../../ui/theme";
import { apiSignup } from "../../lib/api";

export default function SignupScreen({ navigation, onAuthed }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    try {
      setLoading(true);
      await apiSignup({ name, email, password });
      onAuthed?.();
    } catch (e) {
      Alert.alert("Sign up failed", String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <Segmented
        left={{ label: "Login", value: "login" }}
        right={{ label: "Sign Up", value: "signup" }}
        value="signup"
        onChange={(v) => v === "login" && navigation.replace("Login")}
      />

      <Text style={styles.label}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Enter your name"
        placeholderTextColor="rgba(0,0,0,0.35)"
        style={styles.input}
      />

      <Text style={[styles.label, { marginTop: 14 }]}>Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Enter your email"
        placeholderTextColor="rgba(0,0,0,0.35)"
        style={styles.input}
      />

      <Text style={[styles.label, { marginTop: 14 }]}>Password</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Create a password"
        placeholderTextColor="rgba(0,0,0,0.35)"
        style={styles.input}
      />

      <View style={{ height: 26 }} />
      <PillButton title="Create account" loading={loading} onPress={onSubmit} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  label: { color: "white", fontSize: 16, fontWeight: "700", marginBottom: 8, marginLeft: 2 },
  input: {
    height: 50,
    borderRadius: 10,
    backgroundColor: theme.colors.inputBg,
    paddingHorizontal: 14,
    fontSize: 16,
  },
});
