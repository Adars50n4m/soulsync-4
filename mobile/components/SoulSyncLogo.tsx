import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from "react-native-svg";
import { styled } from 'nativewind';

const StyledView = styled(View);

export const SoulSyncLogo = ({ className, width, height }: { className?: string; width?: number; height?: number }) => (
    <StyledView className={className} style={{ width, height }}>
        <Svg width="100%" height="100%" viewBox="0 0 200 200">
            <Defs>
                <LinearGradient id="soulGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor="#8b5cf6" />
                    <Stop offset="50%" stopColor="#ec4899" />
                    <Stop offset="100%" stopColor="#f43f5e" />
                </LinearGradient>
            </Defs>
            <Path
                d="M100 170 C 60 140, 20 100, 20 60 C 20 30, 50 15, 75 15 C 90 15, 100 25, 100 35 C 100 25, 110 15, 125 15 C 150 15, 180 30, 180 60 C 180 100, 140 140, 100 170 Z"
                fill="url(#soulGradient)"
            />
            <Circle cx="70" cy="65" r="14" fill="white" fillOpacity="0.2" />
            <Circle cx="70" cy="65" r="10" fill="white" />
            <Circle cx="130" cy="65" r="14" fill="white" fillOpacity="0.2" />
            <Circle cx="130" cy="65" r="10" fill="white" />
            <Path
                d="M100 170 C 80 150, 60 120, 60 90 C 60 60, 80 40, 100 40"
                stroke="white"
                strokeWidth="4"
                fill="none"
                opacity="0.1"
                strokeLinecap="round"
            />
        </Svg>
    </StyledView>
);
