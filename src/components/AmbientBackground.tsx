import * as React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Color } from "../theme/GlobalStyles";

interface AmbientBackgroundProps {
  children: React.ReactNode;
}

export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({ children }) => {
  return (
    <View style={styles.root}>
      <View style={[styles.blob, styles.blobTopRight]} pointerEvents="none">
        <LinearGradient
          colors={["rgba(150, 50, 255, 0.30)", "rgba(150, 50, 255, 0)"]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View style={[styles.blob, styles.blobBottomLeft]} pointerEvents="none">
        <LinearGradient
          colors={["rgba(120, 30, 207, 0.24)", "rgba(120, 30, 207, 0)"]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <LinearGradient
        colors={["rgba(26, 11, 46, 0)", "rgba(11, 5, 18, 0.6)"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Color.background,
    overflow: "hidden",
  },
  blob: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
  },
  blobTopRight: {
    top: -120,
    right: -140,
  },
  blobBottomLeft: {
    bottom: -140,
    left: -120,
  },
});

export default AmbientBackground;