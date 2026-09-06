import * as React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface AmbientBackgroundProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({ children, style }) => {
  return (
    <View style={[styles.root, style]} pointerEvents={children ? "auto" : "none"}>
      <LinearGradient
        colors={["#3D1466", "#230E3D", "#11071F", "#0A0512"]}
        locations={[0.0, 0.35, 0.7, 1.0]}
        start={{ x: 0.85, y: 0.0 }}
        end={{ x: 0.1, y: 0.95 }}
        style={styles.gradient}
      />
      <View style={styles.glow} pointerEvents="none">
        <LinearGradient
          colors={["rgba(120, 30, 207, 0.25)", "rgba(120, 30, 207, 0)"]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0A0512",
  },
  gradient: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: "none",
  },
  glow: {
    position: "absolute",
    top: -140,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    overflow: "hidden",
    pointerEvents: "none",
  },
});

export default AmbientBackground;