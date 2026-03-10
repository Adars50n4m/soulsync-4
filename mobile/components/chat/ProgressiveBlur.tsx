import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

interface ProgressiveBlurProps {
    position?: 'top' | 'bottom';
    height?: number;
    intensity?: number;
    tint?: 'light' | 'dark' | 'default';
}

/**
 * ProgressiveBlur — Real iOS-style progressive blur.
 *
 * Uses 6 large overlapping blur zones (each covers ~50% of height)
 * with increasing intensity + a smooth dark gradient overlay
 * to mask any seams. The heavy overlap makes transitions seamless.
 */
function ProgressiveBlur({
    position = 'bottom',
    height = 250,
    intensity = 80,
    tint = 'dark',
}: ProgressiveBlurProps) {
    const isDark = tint === 'dark' || tint === 'default';
    const base = isDark ? '0,0,0' : '255,255,255';
    const isBottom = position === 'bottom';

    // ── ANDROID: smooth gradient (no blur API) ───────────────────────────────
    if (Platform.OS === 'android') {
        const maxA = Math.min(intensity / 100, 0.85);
        const s = `rgba(${base},${maxA.toFixed(2)})`;
        const t = `rgba(${base},0)`;
        return (
            <LinearGradient
                colors={isBottom ? [t, s, s] : [s, s, t] as any}
                locations={isBottom ? [0, 0.65, 1] : [0, 0.35, 1] as any}
                style={[styles.container, { height, [position]: 0 }]}
                pointerEvents="none"
            />
        );
    }

    // ── iOS: 6 large overlapping blur zones ──────────────────────────────────
    // Each zone covers ~50% of height and overlaps heavily with neighbors.
    // This makes the blur transition gradual with no visible edges.
    const ZONES = 100;
    const zoneHeight = height * 0.05; // each zone is 50% of total height

    const blurZones = Array.from({ length: ZONES }).map((_, i) => {
        const progress = i / (ZONES - 1); // 0 to 1

        // Position: evenly distributed
        const zoneTop = isBottom
            ? progress * (height - zoneHeight)
            : (1 - progress) * (height - zoneHeight);

        // Intensity: ramps up with eased curve
        const eased = progress * progress; // quadratic ease-in
        const zoneIntensity = isBottom
            ? intensity * eased
            : intensity * eased;

        // Opacity: also ramps for smoother blend
        const zoneOpacity = isBottom
            ? Math.max(0.05, eased)
            : Math.max(0.05, eased);

        return { top: zoneTop, intensity: zoneIntensity, opacity: zoneOpacity };
    });

    // Smooth dark gradient overlay (16 stops, smoothstep)
    const STOPS = 16;
    const gradColors: string[] = [];
    const gradLocs: number[] = [];
    for (let i = 0; i <= STOPS; i++) {
        const t = i / STOPS;
        const e = t * t * (3 - 2 * t);
        const alpha = isBottom ? e * 0.6 : (1 - e) * 0.6;
        gradColors.push(`rgba(${base},${alpha.toFixed(3)})`);
        gradLocs.push(t);
    }

    return (
        <View
            style={[styles.container, { height, [position]: 0 }]}
            pointerEvents="none"
        >
            {/* Blur zones — large & overlapping */}
            {blurZones.map((zone, i) => (
                <BlurView
                    key={i}
                    intensity={zone.intensity}
                    tint={tint}
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: zone.top,
                        height: zoneHeight,
                        opacity: zone.opacity,
                    }}
                />
            ))}

            {/* Dark gradient on top — smooths everything out */}
            <LinearGradient
                colors={gradColors as any}
                locations={gradLocs as any}
                style={StyleSheet.absoluteFill}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 5,
        overflow: 'hidden',
    },
});

export default ProgressiveBlur;