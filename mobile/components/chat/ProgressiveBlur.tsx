import React from 'react';
import { View, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { Canvas, BackdropFilter, Blur, Fill, LinearGradient, Rect, vec, Mask } from '@shopify/react-native-skia';

interface ProgressiveBlurProps {
    position?: 'top' | 'bottom';
    height?: number;
    intensity?: number;
}

const ProgressiveBlur = ({
    position = 'top',
    height = 180,
    intensity = 40,
}: ProgressiveBlurProps) => {
    const { width } = useWindowDimensions();
    const isTop = position === 'top';
    
    // Safety check for Skia module availability
    let SkiaAvailable = true;
    try {
        require('@shopify/react-native-skia');
    } catch (e) {
        SkiaAvailable = false;
    }

    if (!SkiaAvailable) {
        return (
            <View
                style={{
                    position: 'absolute',
                    [position]: 0,
                    left: 0,
                    right: 0,
                    height,
                    backgroundColor: isTop ? 'rgba(0,0,0,0.35)' : 'transparent',
                    zIndex: 2,
                }}
                pointerEvents="none"
            />
        );
    }

    // Scale standard expo intensity to Skia blur radius
    const skiaBlur = Math.max(1, intensity / 2.5); 
    

    return (
        <View
            style={{
                position: 'absolute',
                [position]: 0,
                left: 0,
                right: 0,
                height,
                zIndex: 2,
            }}
            pointerEvents="none"
        >
            <Canvas style={StyleSheet.absoluteFill}>
                    <Mask
                        mask={
                            <Rect x={0} y={0} width={width} height={height}>
                                <LinearGradient
                                    start={vec(0, isTop ? 0 : height)}
                                    end={vec(0, isTop ? height : 0)}
                                    colors={['#fff', 'transparent']}
                                />
                            </Rect>
                        }
                    >
                        <BackdropFilter filter={<Blur blur={skiaBlur} />}>
                            <Fill color="transparent" />
                        </BackdropFilter>
                    </Mask>

                <Rect x={0} y={0} width={width} height={height}>
                    <LinearGradient
                        start={vec(0, isTop ? 0 : height)}
                        end={vec(0, isTop ? height : 0)}
                        colors={['rgba(0,0,0,0.4)', 'transparent']}
                    />
                </Rect>
            </Canvas>
        </View>
    );
};

export default ProgressiveBlur;
