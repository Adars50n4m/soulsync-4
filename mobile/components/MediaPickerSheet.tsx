import React, { useRef, useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, Animated, PanResponder, Dimensions, FlatList, Image, Text, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { SwiftUIButton } from './SwiftUIButton';

interface MediaPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectCamera: () => void;
  onSelectGallery: () => void; // Keeps the gallery picker as a fallback or full view if needed
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
  const { height: screenHeight, width: screenWidth } = Dimensions.get('window');
  // Taller sheet for grid view
  const sheetHeight = screenHeight * 0.85; 

  const [photos, setPhotos] = useState<MediaLibrary.Asset[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
        if (gestureState.dy > 150 || gestureState.vy > 0.5) {
          handleClose();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      loadPhotos();
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
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
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const loadPhotos = async () => {
      setIsLoading(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      
      if (status === 'granted') {
          const assets = await MediaLibrary.getAssetsAsync({
              first: 50,
              sortBy: ['creationTime'],
              mediaType: ['photo', 'video'],
          });
          setPhotos(assets.assets);
      }
      setIsLoading(false);
  };

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: sheetHeight,
        duration: 200,
        useNativeDriver: true,
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
    // Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Grid Render Items
  const renderItem = ({ item, index }: { item: any, index: number }) => {
      const isCameraTile = index === 0;
      const tileSize = (screenWidth) / 3;

      if (isCameraTile) {
          return (
              <Pressable 
                onPress={onSelectCamera}
                style={[styles.cameraTile, { width: tileSize, height: tileSize }]}
              >
                  <View style={styles.cameraIconContainer}>
                     <MaterialIcons name="photo-camera" size={32} color="#fff" />
                  </View>
                  <Text style={styles.cameraText}>Camera</Text>
              </Pressable>
          );
      }

      // Adjust index for photos array (since 0 is camera)
      const photoIndex = index - 1;
      if (photoIndex >= photos.length) return null;
      const asset = photos[photoIndex];

      return (
          <Pressable 
            onPress={onSelectGallery} // For now triggers standard gallery picker, ideal would be to select this specific asset
            style={{ width: tileSize, height: tileSize, padding: 1 }}
          >
              <Image 
                source={{ uri: asset.uri }} 
                style={{ width: '100%', height: '100%' }} 
                resizeMode="cover"
              />
              {asset.mediaType === 'video' && (
                  <View style={styles.videoIndicator}>
                      <Text style={styles.videoDuration}>{formatDuration(asset.duration)}</Text>
                  </View>
              )}
          </Pressable>
      );
  };

  const formatDuration = (duration: number) => {
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  if (!visible) return null;

  // Combined data: First item is a dummy for "Camera", rest are photos
  const gridData = [ { id: 'camera-tile' }, ...photos ];

  return (
    <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <Animated.View
        style={[
          styles.sheet,
          {
            height: sheetHeight,
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
        <BlurView intensity={90} tint="dark" style={styles.container}>
          
          {/* Header */}
          <View style={styles.header}>
              <Pressable onPress={handleClose} style={styles.headerButton}>
                  <Text style={styles.headerButtonText}>Cancel</Text>
              </Pressable>
              
              <View style={styles.headerTitleContainer}>
                 <Text style={[styles.headerTitle, { color: '#fff' }]}>Photos</Text>
                 <Text style={[styles.headerTitle, { opacity: 0.5 }]}>Albums</Text>
              </View>

              <View style={styles.headerButton} /> 
          </View>

          {/* Quick Options Row */}
          <View style={styles.optionsRow}>
              <Pressable style={styles.optionButton}>
                  <View style={[styles.optionIcon, { backgroundColor: '#1e1e24' }]}>
                      <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 16}}>Aa</Text>
                  </View>
                  <Text style={styles.optionLabel}>Text</Text>
              </Pressable>

              <Pressable style={styles.optionButton} onPress={onSelectAudio}>
                  <View style={[styles.optionIcon, { backgroundColor: '#1e1e24' }]}>
                      <Ionicons name="musical-notes" size={20} color="#fff" />
                  </View>
                  <Text style={styles.optionLabel}>Music</Text>
              </Pressable>
               
               <Pressable style={styles.optionButton}>
                  <View style={[styles.optionIcon, { backgroundColor: '#1e1e24' }]}>
                      <Ionicons name="grid" size={20} color="#fff" />
                  </View>
                   <Text style={styles.optionLabel}>Layout</Text>
              </Pressable>
          </View>

          {/* Handler Bar */}
          <View style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
          </View>
          
          {/* Main Content */}
          {hasPermission === false ? (
               <View style={styles.permissionContainer}>
                   <Text style={styles.permissionText}>Access to photos is required.</Text>
               </View>
          ) : (
            <FlatList
                data={gridData}
                renderItem={renderItem}
                keyExtractor={(item, index) => index.toString()}
                numColumns={3}
                contentContainerStyle={styles.gridContent}
                showsVerticalScrollIndicator={false}
            />
          )}

        </BlurView>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 999,
  },
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  
  // Header
  header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 10,
  },
  headerButton: {
      width: 60,
  },
  headerButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '500',
  },
  headerTitleContainer: {
      flexDirection: 'row',
      gap: 16,
      backgroundColor: 'rgba(255,255,255,0.1)',
      padding: 6,
      paddingHorizontal: 8,
      borderRadius: 20,
  },
  headerTitle: {
      color: 'rgba(255,255,255,0.5)',
      fontWeight: '600',
      fontSize: 14,
  },

  // Options Row
  optionsRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      marginBottom: 10,
      gap: 16,
  },
  optionButton: {
      width: 80,
      height: 60,
      backgroundColor: '#1c1c1e',
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
  },
  optionIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
  },
  optionLabel: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '500',
  },

  // Grid
  gridContent: {
      paddingBottom: 40,
  },
  cameraTile: {
      backgroundColor: '#1c1c1e',
      alignItems: 'center',
      justifyContent: 'center',
      margin: 1,
  },
  cameraIconContainer: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: 'rgba(255,255,255,0.1)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
  },
  cameraText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '500',
  },
  videoIndicator: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
  },
  videoDuration: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '600',
  },
  permissionContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
  },
  permissionText: {
      color: 'rgba(255,255,255,0.5)',
  },
});

