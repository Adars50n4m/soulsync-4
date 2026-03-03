import { View, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

interface ProgressiveBlurProps {
    position?: 'top' | 'bottom';
    height?: number;
    intensity?: number;
}

import { LinearGradient } from 'expo-linear-gradient';

const ProgressiveBlur = ({
    position = 'top',
    height = 180,
    intensity = 300,
}: ProgressiveBlurProps) => {
    // 8 Layers of overlapping blur with feathered heights and low opacities
    const blurLayers = Platform.OS === 'android' ? 4 : 8; 
    
    return (
        <View
            style={{
                position: 'absolute',
                [position]: 0,
                left: 0,
                right: 0,
                height,
                zIndex: 2,
                overflow: 'hidden',
            }}
            pointerEvents="none"
        >
            {/* 1. Base Gradient Smoothing (10 stops for professional transition) */}
            <LinearGradient
                colors={position === 'top' 
                    ? ['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.2)', 'transparent'] 
                    : ['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.8)']
                }
                locations={[0, 0.3, 0.6, 1]}
                style={StyleSheet.absoluteFill}
            />

            {/* 2. Feathered Overlapping Blur Layers (The "Secret Sauce") */}
            {Array.from({ length: blurLayers }).map((_, i) => {
                const ratio = (i + 1) / blurLayers;
                // We add a +20px "feather" to each layer's height to prevent sharp boundaries
                const layerHeight = (height * ratio) + 20;

                return (
                    <BlurView
                        key={i}
                        intensity={100} // Higher intensity but lower opacity for quality
                        tint="dark"
                        style={{
                            position: 'absolute',
                            [position]: 0,
                            left: 0,
                            right: 0,
                            height: layerHeight,
                            opacity: (1 - ratio) * 0.15, // Gradually fading out as we move away from edge
                        }}
                        
                    />
                );
            })}

            {/* 3. Final Multi-Stop Blend Pass */}
            <LinearGradient
                colors={position === 'top' 
                    ? ['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)', 'transparent'] 
                    : ['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.6)']
                }
                locations={[0, 0.2, 0.5, 1]}
                style={StyleSheet.absoluteFill}
            />
        </View>
    );
};

export default ProgressiveBlur;
