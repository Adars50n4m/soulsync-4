import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  Text,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { useApp } from '../context/AppContext';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path } from 'react-native-svg';
import { PanGestureHandler, State } from 'react-native-gesture-handler';

interface MediaPreviewModalProps {
  visible: boolean;
  mediaUri: string;
  mediaType: 'image' | 'video' | 'audio';
  onClose: () => void;
  onSend: (mediaList: { uri: string; type: 'image' | 'video' | 'audio' }[], caption?: string) => void;
  isUploading?: boolean;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  visible,
  mediaUri,
  mediaType,
  onClose,
  onSend,
  isUploading = false,
}) => {
  const [caption, setCaption] = useState('');
  
  // Media List state for multi-sending
  const [mediaItems, setMediaItems] = useState<{ uri: string; type: 'image' | 'video' | 'audio' }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentMedia = mediaItems[currentIndex] || { uri: mediaUri, type: mediaType };
  const currentUri = currentMedia.uri;
  const currentType = currentMedia.type;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const videoRef = useRef<Video>(null);
  const viewShotRef = useRef<View>(null);
  const { activeTheme } = useApp();

  // Tools states
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [paths, setPaths] = useState<{ path: string; color: string; strokeWidth: number }[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  
  // Text Overlays
  const [textOverlays, setTextOverlays] = useState<{ id: string; text: string; x: number; y: number; color: string }[]>([]);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);

  useEffect(() => {
    setMediaItems([{ uri: mediaUri, type: mediaType }]);
    setCurrentIndex(0);
    setPaths([]);
    setTextOverlays([]);
  }, [mediaUri, mediaType]);

  useEffect(() => {
    if (visible) {
      StatusBar.setHidden(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      StatusBar.setHidden(false);
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (!visible) return null;

  // Tools Handlers
  const applyDrawingsToImage = async () => {
    if (paths.length === 0 && textOverlays.length === 0) return currentUri;
    
    // As native shot is unsupported right now, just fallback warning and return normal. 
    // Ideally, we'd capture.
    Alert.alert(
      'Drawing Not Supported',
      'The view-shot library required to bake drawings is missing from the native build. Your drawings will not be sent.'
    );
    
    setPaths([]);
    setTextOverlays([]);
    return currentUri;
  };

  const handleSend = async () => {
    if (isUploading) return;
    await applyDrawingsToImage(); // fake baking
    onSend(mediaItems, caption.trim() || undefined);
    setCaption('');
  };

  const handleClose = () => {
    setCaption('');
    setPaths([]);
    setTextOverlays([]);
    setIsDrawingMode(false);
    onClose();
  };

  const handlePickGallery = async () => {
    if (isUploading) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 1,
      allowsMultipleSelection: true,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const newItems: {uri: string, type: 'image'|'video'|'audio'}[] = result.assets.map(a => ({
        uri: a.uri,
        type: a.type === 'video' ? 'video' : 'image'
      }));
      setMediaItems(prev => [...prev, ...newItems]);
      setCurrentIndex(mediaItems.length); // go to the newly added first element
      setPaths([]);
      setTextOverlays([]);
    }
  };

  const handleCrop = async () => {
    if (currentType !== 'image') return;
    Alert.alert(
      'Crop Image',
      'The crop feature requires a native rebuild of the app (npx expo run:ios) to install the crop library.'
    );
  };

  const toggleDrawing = () => {
    if (!isDrawingMode) setActiveTextId(null);
    setIsDrawingMode(!isDrawingMode);
  };

  const handleUndoPen = () => {
    if (paths.length > 0) {
      setPaths(paths.slice(0, -1));
    }
  };

  const handleAddText = () => {
    setIsDrawingMode(false);
    const newId = Date.now().toString();
    setTextOverlays([...textOverlays, { id: newId, text: 'Tap to edit', x: Dimensions.get('window').width / 2.5, y: 150, color: '#FFFFFF' }]);
    setActiveTextId(newId);
  };

  const colors = ['#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#000000'];
  const handleCycleTextColor = (id: string) => {
    setTextOverlays(prev => prev.map(t => {
      if (t.id === id) {
        const nextColorIdx = (colors.indexOf(t.color || '#FFFFFF') + 1) % colors.length;
        return { ...t, color: colors[nextColorIdx] };
      }
      return t;
    }));
  };

  // Text Drag Pan Handlers
  const onTextDrag = (e: any, id: string) => {
    const { translationX, translationY } = e.nativeEvent;
    // Basic handler idea for smooth drag. Proper implementation involves mapping a PanGestureHandler to animated values
  };

  // Drawing Handlers
  const onGestureEvent = (e: any) => {
    if (!isDrawingMode) return;
    const { x, y } = e.nativeEvent;
    setCurrentPath((prev) => (prev ? `${prev} L ${x} ${y}` : `M ${x} ${y}`));
  };
  const onHandlerStateChange = (e: any) => {
    if (!isDrawingMode) return;
    if (e.nativeEvent.state === State.END || e.nativeEvent.state === State.CANCELLED) {
      if (currentPath) {
        setPaths([...paths, { path: currentPath, color: activeTheme.primary, strokeWidth: 5 }]);
        setCurrentPath('');
      }
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        {/* Top Header Controls */}
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={handleClose} disabled={isUploading}>
            <MaterialIcons name="close" size={28} color="#fff" />
          </Pressable>
          
          <View style={styles.headerActions}>
            {isDrawingMode && paths.length > 0 && (
              <Pressable style={styles.iconButton} onPress={handleUndoPen}>
                <MaterialIcons name="undo" size={24} color="#fff" />
              </Pressable>
            )}
            <Pressable style={[styles.iconButton, { opacity: currentType === 'video' ? 0.3 : 1 }]} onPress={handleCrop} disabled={isUploading || currentType === 'video'}>
              <MaterialIcons name="crop-rotate" size={24} color="#fff" />
            </Pressable>
            <Pressable style={[styles.iconButton, { opacity: currentType === 'video' ? 0.3 : 1 }]} onPress={handleAddText} disabled={isUploading || currentType === 'video'}>
              <MaterialIcons name="title" size={24} color="#fff" />
            </Pressable>
            <Pressable style={[styles.iconButton, isDrawingMode && styles.iconActive, { opacity: currentType === 'video' ? 0.3 : 1 }]} onPress={toggleDrawing} disabled={isUploading || currentType === 'video'}>
              <MaterialIcons name="edit" size={24} color={isDrawingMode ? activeTheme.primary : '#fff'} />
            </Pressable>
          </View>
        </View>

        {/* Media Preview Area */}
        <View style={styles.mediaContainer}>
          {currentType === 'image' && (
            <PanGestureHandler onGestureEvent={onGestureEvent} onHandlerStateChange={onHandlerStateChange} enabled={isDrawingMode}>
              <Animated.View style={StyleSheet.absoluteFill}>
                <View ref={viewShotRef as any} collapsable={false} style={styles.viewShotCanvas}>
                  <Image source={{ uri: currentUri }} style={styles.mediaImage} resizeMode="contain" />
                  
                  {/* Drawing & Text Canvas Overlays */}
                  {(paths.length > 0 || currentPath || textOverlays.length > 0) && (
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                      <Svg height="100%" width="100%">
                        {paths.map((p, i) => (
                          <Path key={i} d={p.path} stroke={p.color} strokeWidth={p.strokeWidth} fill="none" strokeLinecap="round" />
                        ))}
                        {currentPath ? (
                          <Path d={currentPath} stroke={activeTheme.primary} strokeWidth={5} fill="none" strokeLinecap="round" />
                        ) : null}
                      </Svg>
                      
                      {textOverlays.map((t) => (
                        <PanGestureHandler
                          key={t.id}
                          onGestureEvent={(e) => {
                            if (activeTextId === t.id) return; // disable drag while typing
                            const { translationX, translationY } = e.nativeEvent;
                            setTextOverlays(prev => prev.map(o => o.id === t.id ? { ...o, x: o.x + translationX/10, y: o.y + translationY/10 } : o));
                          }}
                        >
                          <Animated.View style={[styles.canvasTextContainer, { left: t.x, top: t.y }]}>
                            <Pressable 
                              onPress={() => setActiveTextId(t.id)} 
                              onLongPress={() => handleCycleTextColor(t.id)}
                            >
                              <TextInput
                                style={[styles.canvasText, { color: t.color || '#FFFFFF' }]}
                                value={t.text}
                                onChangeText={(v) => setTextOverlays(textOverlays.map(x => x.id === t.id ? { ...x, text: v } : x))}
                                onBlur={() => setActiveTextId(null)}
                                autoFocus={activeTextId === t.id}
                                multiline
                                editable={activeTextId === t.id}
                                pointerEvents={activeTextId === t.id ? 'auto' : 'none'}
                              />
                            </Pressable>
                          </Animated.View>
                        </PanGestureHandler>
                      ))}
                    </View>
                  )}
                </View>
              </Animated.View>
            </PanGestureHandler>
          )}
          {currentType === 'video' && (
            <View style={styles.videoWrapper}>
              <Video
                ref={videoRef}
                source={{ uri: currentUri }}
                style={styles.mediaImage}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls={true}
                isLooping={false}
              />
            </View>
          )}
          {currentType === 'audio' && (
            <View style={styles.audioPreview}>
              <MaterialIcons name="graphic-eq" size={80} color={activeTheme.primary} />
              <MaterialIcons name="play-circle-filled" size={60} color="#fff" />
            </View>
          )}

          {/* Swipe Controls for Multiple Items */}
          {mediaItems.length > 1 && (
            <View style={styles.swipeIndicators}>
              <Pressable 
                style={[styles.navArrow, { opacity: currentIndex > 0 ? 1 : 0.3 }]} 
                onPress={() => currentIndex > 0 && setCurrentIndex(currentIndex - 1)}
              >
                <MaterialIcons name="chevron-left" size={32} color="#fff" />
              </Pressable>
              
              <View style={styles.dotsRow}>
                {mediaItems.map((_, idx) => (
                  <View key={idx} style={[styles.dot, { backgroundColor: idx === currentIndex ? activeTheme.primary : 'rgba(255,255,255,0.4)' }]} />
                ))}
              </View>

              <Pressable 
                style={[styles.navArrow, { opacity: currentIndex < mediaItems.length - 1 ? 1 : 0.3 }]} 
                onPress={() => currentIndex < mediaItems.length - 1 && setCurrentIndex(currentIndex + 1)}
              >
                <MaterialIcons name="chevron-right" size={32} color="#fff" />
              </Pressable>
            </View>
          )}
        </View>

        {/* Bottom Input Area */}
        <View style={styles.bottomContainer}>
          <View style={styles.inputActionRow}>
            <View style={styles.inputWrapper}>
              <Pressable style={styles.cameraRollIcon} onPress={handlePickGallery} disabled={isUploading}>
                <MaterialIcons name="photo-library" size={24} color="#fff" />
              </Pressable>
              <TextInput
                style={styles.captionInput}
                placeholder="Add a caption..."
                placeholderTextColor="rgba(255, 255, 255, 0.6)"
                value={caption}
                onChangeText={setCaption}
                maxLength={500}
                editable={!isUploading}
                multiline
              />
              <Pressable style={styles.timerIcon} disabled={isUploading}>
                <MaterialIcons name="av-timer" size={22} color="#fff" />
              </Pressable>
            </View>
            
            <Pressable
              style={[styles.sendButton, { backgroundColor: activeTheme.primary }, isUploading && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialIcons name="send" size={20} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 998,
  },
  keyboardAvoid: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 30,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  viewShotCanvas: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  canvasTextContainer: {
    position: 'absolute',
    padding: 10,
  },
  canvasText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
    minWidth: 100,
  },
  iconActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
  },
  videoWrapper: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  audioPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  swipeIndicators: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  navArrow: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 4,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bottomContainer: {
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    paddingTop: 12,
    backgroundColor: '#000',
  },
  inputActionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
    minHeight: 48,
  },
  cameraRollIcon: {
    marginRight: 8,
    padding: 4,
  },
  timerIcon: {
    marginLeft: 8,
    padding: 4,
  },
  captionInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    maxHeight: 100,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    paddingBottom: Platform.OS === 'ios' ? 8 : 4,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  sendButtonDisabled: {
    backgroundColor: '#1E1E1E',
  },
});
