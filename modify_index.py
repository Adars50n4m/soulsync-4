import re

with open('mobile/app/(tabs)/index.tsx', 'r') as f:
    content = f.read()

# 1. Replace liquidGlassTransition definition with customTransition
content = re.sub(
    r'const liquidGlassTransition = SharedTransition\.springify\(\)\s*\.damping\(28\)\s*\.stiffness\(320\)\s*\.mass\(0\.8\);',
    r'const customTransition = SharedTransition.duration(550).springify();',
    content
)

# 2. Replace liquidGlassTransition usages with customTransition
content = content.replace('liquidGlassTransition', 'customTransition')

# 3. Use inline template literals for tags
content = re.sub(
    r'SharedTransitionTags\.chatCard\(([^)]+)\)',
    r'`chat-card-${\1}`',
    content
)
content = re.sub(
    r'SharedTransitionTags\.avatar\(([^)]+)\)',
    r'`avatar-${\1}`',
    content
)
content = re.sub(
    r'SharedTransitionTags\.chatName\(([^)]+)\)',
    r'`chat-name-${\1}`',
    content
)
content = re.sub(
    r'SharedTransitionTags\.profilePicture\(([^)]+)\)',
    r'`profile-picture-${\1}`',
    content
)

with open('mobile/app/(tabs)/index.tsx', 'w') as f:
    f.write(content)

