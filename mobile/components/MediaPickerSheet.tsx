import React, { useRef, useEffect } from 'react';
import { View, Pressable, StyleSheet, Animated, PanResponder, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SwiftUIButton } from './SwiftUIButton';

interface MediaPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectCamera: () => void;
  onSelectGallery: () => void;
  onSelectAudio: () => void;
}

export const MediaPickerSheet: React.FC<MediaPickerSheetProps> = ({
  visible,
  onClose,
  onSelectCamera,
  onSelectGallery,
  onSelectAudio,
}) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const { height: screenHeight } = Dimensions.get('window');
  const sheetHeight = 380;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          handleClose();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: false,
          tension: 50,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: sheetHeight,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: sheetHeight,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
      slideAnim.setValue(0);
      opacityAnim.setValue(0);
    });
  };

  const handleHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, sheetHeight],
                  outputRange: [0, sheetHeight],
                }),
              },
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <BlurView intensity={100} tint="dark" style={styles.blurContainer}>
          {/* Drag Handle */}
          <View style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
          </View>

          {/* Camera Button */}
          <SwiftUIButton
            type="glass"
            onPress={() => {
              handleHaptic();
              handleClose();
              setTimeout(onSelectCamera, 200);
            }}
            style={styles.button}
          >
            <MaterialIcons name="photo-camera" size={24} color="#fff" />
          </SwiftUIButton>

          {/* Gallery Button */}
          <SwiftUIButton
            type="glass"
            onPress={() => {
              handleHaptic();
              handleClose();
              setTimeout(onSelectGallery, 200);
            }}
            style={styles.button}
          >
            <MaterialIcons name="photo-library" size={24} color="#fff" />
          </SwiftUIButton>

          {/* Audio Button */}
          <SwiftUIButton
            type="glass"
            onPress={() => {
              handleHaptic();
              handleClose();
              setTimeout(onSelectAudio, 200);
            }}
            style={styles.button}
          >
            <MaterialIcons name="audiotrack" size={24} color="#fff" />
          </SwiftUIButton>

          {/* Cancel Button */}
          <SwiftUIButton
            type="danger"
            onPress={() => {
              handleHaptic();
              handleClose();
            }}
            style={styles.cancelButton}
          >
            <MaterialIcons name="close" size={24} color="#fff" />
          </SwiftUIButton>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    height: 380,
  },
  blurContainer: {
    flex: 1,
    paddingBottom: 32,
    paddingHorizontal: 16,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(30, 30, 35, 0.4)',
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  button: {
    height: 60,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  cancelButton: {
    height: 60,
    marginTop: 8,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
});
