import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
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
                {/* 1. Masked Liquid Blur Layer */}
                <Mask
                    mask={
                        <Rect x={0} y={0} width={width} height={height}>
                            <LinearGradient
                                start={vec(0, isTop ? 0 : height)}
                                end={vec(0, isTop ? height : 0)}
                                colors={['#fff', 'transparent']} // white is opaque to mask
                            />
                        </Rect>
                    }
                >
                    <BackdropFilter filter={<Blur blur={skiaBlur} />}>
                        <Fill color="transparent" />
                    </BackdropFilter>
                </Mask>

                {/* 2. Seamless Dark Gradient Overlay to match iOS style */}
                <Rect x={0} y={0} width={width} height={height}>
                    <LinearGradient
                        start={vec(0, isTop ? 0 : height)}
                        end={vec(0, isTop ? height : 0)}
                        colors={['rgba(0,0,0,0.65)', 'transparent']}
                    />
                </Rect>
            </Canvas>
        </View>
    );
};

export default ProgressiveBlur;
