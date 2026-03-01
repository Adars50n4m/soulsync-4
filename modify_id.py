import re

with open('mobile/app/chat/[id].tsx', 'r') as f:
    content = f.read()

# 1. Add customTransition definition near the imports
content = re.sub(
    r'(const \{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT \} = Dimensions\.get\(\'window\'\);)',
    r'const customTransition = SharedTransition.duration(550).springify();\n\n\1',
    content
)

# 2. Add transition tags to Avatar in the header
content = re.sub(
    r'(<Animated\.Image\s*\n\s*source=\{\{ uri: contact\.avatar \}\}\s*\n\s*style=\{styles\.avatar\}\s*\n\s*)sharedTransitionTag=\{[^\}]+\}\s*\n\s*sharedTransitionStyle=\{[^\}]+\}',
    r'\1sharedTransitionTag={`avatar-${id}`}\n                                    sharedTransitionStyle={customTransition}',
    content
)

# 3. Add transition tags to Chat Name in the header
content = re.sub(
    r'(<Animated\.Text\s*\n\s*style=\{styles\.contactName\}\s*\n\s*)sharedTransitionTag=\{[^\}]+\}\s*\n\s*sharedTransitionStyle=\{[^\}]+\}',
    r'\1sharedTransitionTag={`chat-name-${id}`}\n                                    sharedTransitionStyle={customTransition}',
    content
)

# 4. Remove morphProgress and backdropOpacity
content = re.sub(r'const morphProgress = useSharedValue\([^;]+;\n\s*', '', content)
content = re.sub(r'const backdropOpacity = useSharedValue\([^;]+;\n\s*', '', content)

# 5. Remove fullScreenMorphStyle definition
content = re.sub(r'// Unified morph container — single element: pill shape ↔ full screen\s*\n\s*const fullScreenMorphStyle = useAnimatedStyle\(\(\) => \{.*?\n\s*\}\);\n\s*', '', content, flags=re.DOTALL)

# 6. Remove headerInternalStyle definition
content = re.sub(r'// Header internal positioning — animated padding inside the unified morph container\s*\n\s*const headerInternalStyle = useAnimatedStyle\(\(\) => \{.*?\n\s*\}\);\n\s*', '', content, flags=re.DOTALL)

# 7. Remove screenBgStyle definition
content = re.sub(r'// Full-screen black backdrop that fades out during back morph\s*\n\s*const screenBgStyle = useAnimatedStyle\(\(\) => \(\{.*?\n\s*\}\)\);\n\s*', '', content, flags=re.DOTALL)

# 8. Update main layout wrapper tags and remove morph styles
content = content.replace(
    '''            {/* Full-screen black backdrop — prevents home screen bleed-through during back morph */}
            <Animated.View style={screenBgStyle} pointerEvents="none" />

            {/* Unified Morph Container — pill ↔ full screen as ONE element */}
            <Animated.View 
                style={fullScreenMorphStyle}
                sharedTransitionTag={SharedTransitionTags.chatCard(id || '')}
                sharedTransitionStyle={SharedTransition.springify().damping(28).stiffness(320).mass(0.8)}
            >''',
    '''            {/* Unified Morph Container — pill ↔ full screen as ONE element */}
            <Animated.View 
                style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }]}
                sharedTransitionTag={`chat-card-${id}`}
                sharedTransitionStyle={customTransition}
            >'''
)

# 9. Update headerWrapper style
content = content.replace(
    '<Animated.View style={[styles.headerWrapper, headerInternalStyle]}>',
    '<Animated.View style={[styles.headerWrapper, { paddingTop: 50, paddingHorizontal: 16 }]}>'
)

# 10. Fix handleBack
handle_back_replacement = '''    const handleBack = useCallback(() => {
        if (onBackStart) onBackStart();

        // Content fades out quickly for smoother perceived transition
        chatBodyOpacity.value = withTiming(0, {
            duration: MORPH_OUT_DURATION * 0.35,
            easing: Easing.out(Easing.quad),
        });

        // Use native navigation goBack to trigger shared transition OUT
        if (onBack) {
            runOnJS(onBack)();
        } else if (navigation.canGoBack()) {
            runOnJS(navigation.goBack)();
        } else {
            console.warn('Navigation: Cannot go back');
        }
    }, [onBackStart, onBack, navigation, chatBodyOpacity]);'''
content = re.sub(r'const handleBack = useCallback\(\(\) => \{.+?\}, \[onBackStart, finishBack, morphProgress, chatBodyOpacity, backdropOpacity\]\);', handle_back_replacement, content, flags=re.DOTALL)

# 11. Remove morphProgress from Animate IN useEffect
content = re.sub(
    r'morphProgress\.value = withTiming\(1, \{\s*duration: MORPH_IN_DURATION,\s*easing: MORPH_EASING\s*\}\);\n\n\s*',
    '',
    content
)

with open('mobile/app/chat/[id].tsx', 'w') as f:
    f.write(content)

