import React from 'react';
import { View } from 'react-native';
import { BlurView } from 'expo-blur';

interface ProgressiveBlurProps {
    position?: 'top' | 'bottom';
    height?: number;
    intensity?: number;
    steps?: number;
}

const ProgressiveBlur = ({
    position = 'top',
    height = 180,
    intensity = 300,
    steps = 90,
}: ProgressiveBlurProps) => {
    // Progressive blur optimization:
    // rendering dozens of BlurView layers is extremely expensive on the GPU.
    // We reduce steps to 6-8 for a similar effect with 4x less overhead.
    const blurSteps = Math.min(steps, 8); 
    return (
        <View
            style={{
                position: 'absolute',
                [position]: 0,
                left: 0,
                right: 0,
                height,
                zIndex: position === 'top' ? 90 : 50,
                overflow: 'hidden',
            }}
            pointerEvents="none"
        >
            {Array.from({ length: blurSteps }).map((_, i) => {
                const ratio = (i + 1) / blurSteps;
                const layerHeight = height * ratio;
                const fade = Math.pow(1 - ratio, 1.2);
                const opacity = Math.max(0, Math.min(1, fade));

                return (
                    <BlurView
                        key={i}
                        intensity={intensity / 4} // Adjusted for fewer layers
                        tint="dark"
                        style={{
                            position: 'absolute',
                            [position]: 0,
                            left: 0,
                            right: 0,
                            height: layerHeight,
                            opacity,
                        }}
                    />
                );
            })}
        </View>
    );
};

export default ProgressiveBlur;
