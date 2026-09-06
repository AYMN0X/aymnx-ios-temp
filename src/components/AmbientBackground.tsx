import * as React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface AmbientBackgroundProps {
  children: React.ReactNode;
}

export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({ children }) => {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#1C0E2D", "#120A1E", "#0B0612"]}
        start={{ x: 0.8, y: 0.0 }}
        end={{ x: 0.1, y: 1.0 }}
        style={styles.gradient}
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B0612",
  },
  gradient: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: "none",
  },
});

export default AmbientBackground;