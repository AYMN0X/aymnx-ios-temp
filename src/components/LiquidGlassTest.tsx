import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, Fill, Skia, Shader } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue, withSpring } from 'react-native-reanimated';

const LIQUID_GLASS_SKSL = `
uniform vec2 u_resolution;
uniform vec2 u_box_size;
uniform float u_radius;
uniform vec2 u_touch;

float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

vec4 main(vec2 fragCoord) {
    vec2 center = u_resolution * 0.5;
    vec2 p = fragCoord - center;
    vec2 halfSize = u_box_size * 0.5;

    float dist = sdRoundedBox(p, halfSize, u_radius);

    if (dist > 1.5) {
        return vec4(0.0);
    }

    float rimWidth = 18.0;
    float edgeFactor = clamp(-dist / rimWidth, 0.0, 1.0);

    vec2 touchPos = u_touch - center;
    vec2 lightDir = normalize(touchPos - p + vec2(0.001));

    vec2 normal = normalize(p / (halfSize + 0.001));

    float diffuse = clamp(dot(-normal, lightDir), 0.0, 1.0);
    float rimLight = pow(1.0 - edgeFactor, 2.2) * diffuse * 1.4;

    float innerBevel = smoothstep(0.0, 0.8, 1.0 - edgeFactor) * 0.12;

    float outerStroke = smoothstep(1.5, -0.5, abs(dist + 0.5) - 0.6) * 0.4;

    vec3 baseGlass = mix(vec3(0.05), vec3(0.12), 1.0 - edgeFactor);
    vec3 finalRgb = baseGlass + vec3(rimLight + innerBevel + outerStroke);
    float alpha = smoothstep(1.5, -0.5, dist);

    return vec4(finalRgb * alpha, alpha);
}
`;

const glassEffect = Skia.RuntimeEffect.Make(LIQUID_GLASS_SKSL);

export const LiquidGlassTest = () => {
  const canvasWidth = 260;
  const canvasHeight = 130;
  const boxWidth = 240;
  const boxHeight = 100;
  const radius = 24;

  const touchX = useSharedValue(canvasWidth * 0.3);
  const touchY = useSharedValue(canvasHeight * 0.2);

  const gesture = Gesture.Pan()
    .onBegin((event) => {
      touchX.value = event.x;
      touchY.value = event.y;
    })
    .onUpdate((event) => {
      touchX.value = event.x;
      touchY.value = event.y;
    })
    .onFinalize(() => {
      touchX.value = withSpring(canvasWidth * 0.3, { damping: 14, stiffness: 120 });
      touchY.value = withSpring(canvasHeight * 0.2, { damping: 14, stiffness: 120 });
    });

  const uniforms = useDerivedValue(() => {
    return {
      u_resolution: [canvasWidth, canvasHeight],
      u_box_size: [boxWidth, boxHeight],
      u_radius: radius,
      u_touch: [touchX.value, touchY.value],
    };
  }, [touchX, touchY]);

  if (!glassEffect) {
    return null;
  }

  return (
    <View style={styles.container}>
      <GestureDetector gesture={gesture}>
        <Canvas style={styles.canvas}>
          <Fill>
            <Shader source={glassEffect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 16,
  },
  canvas: {
    width: 260,
    height: 130,
  },
});
