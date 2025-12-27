# Visual Design Reference - Blink Battle UI/UX Redesign

## Design Direction

The redesign follows a **neon glassmorphism** aesthetic inspired by:
- F1 racing dashboards and timing screens
- Cyberpunk/futuristic interfaces
- Modern gaming UI trends
- Glassmorphism design pattern

## Color Scheme

### Primary Palette
```
Neon Cyan:   #00ffff  ███████  (Primary actions, highlights)
Neon Pink:   #ff00ff  ███████  (Secondary actions, losses)
Neon Purple: #bf00ff  ███████  (Accents, gradients)
Neon Green:  #00ff88  ███████  (Success, wins)
Neon Blue:   #0099ff  ███████  (Gradients)
```

### Background
```
Base:        #000000  ███████  (Pure black)
Gradient 1:  #0a0015  ███████  (Deep purple)
Gradient 2:  #001a2e  ███████  (Deep blue)
```

### Glass Elements
```
Glass BG:    rgba(255, 255, 255, 0.03)
Glass Border: rgba(255, 255, 255, 0.1)
Glass Hover: rgba(255, 255, 255, 0.08)
```

## Screen Layouts

### 1. Dashboard (Home)

```
┌────────────────────────────────────────┐
│ ⚡ Blink Battle    [0x1234...5678] 🟢 │ ← Header with gradient title
├────────────────────────────────────────┤
│                                        │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐ │ ← Stats Grid (StatTile)
│  │ 15  │  │  8  │  │ 65% │  │235ms│ │   - Wins (green glow)
│  │Wins │  │Loss │  │Win% │  │ Avg │ │   - Losses (pink)
│  └─────┘  └─────┘  └─────┘  └─────┘ │   - Win Rate (cyan, highlighted)
│                                        │   - Avg Reaction (purple)
│  ┌──────────────────────────────────┐ │
│  │           🎮                      │ │ ← Practice Mode Card
│  │      Practice Mode               │ │   (Glass card, hover effect)
│  │  Play free, sharpen your skills  │ │
│  │  [ Play Free ]                   │ │   (Ghost button)
│  └──────────────────────────────────┘ │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │           💎                      │ │ ← PvP Staking Card
│  │       PvP Staking                │ │   (Featured border + glow)
│  │ Compete for real WLD rewards     │ │
│  │  [ Play for Stakes ]             │ │   (Primary button, cyan glow)
│  └──────────────────────────────────┘ │
│                                        │
├────────────────────────────────────────┤
│  [ 🏠 Home ]  [ 📊 History ]  [ 🏆 ] │ ← Bottom Tab Bar (fixed)
└────────────────────────────────────────┘
```

### 2. F1 Reaction Game Screen

```
┌────────────────────────────────────────┐
│ Stake: 0.5 WLD      🟢 Connected      │ ← Game header (glass card)
├────────────────────────────────────────┤
│                                        │
│         F1 REACTION TEST               │ ← Label above lights
│  ┌─────────────────────────────────┐  │
│  │  ⚫  ⚫  ⚫  ⚫  ⚫               │  │ ← 5 F1-style lights
│  │   (All off initially)            │  │   Sequential red countdown
│  └─────────────────────────────────┘  │   All green = GO!
│                                        │
│         WAIT FOR IT...                 │ ← Status text
│                                        │   (or GET READY / GO!)
│           ⚠️                          │
│      Don't tap early!                  │ ← Warning during wait
│                                        │
│                                        │
│            ⚫⚫⚫                       │ ← Animated dots (waiting)
│                                        │
├────────────────────────────────────────┤
│                                        │ ← Racing-inspired grid bg
│         (Grid pattern overlay)         │
└────────────────────────────────────────┘

When GO phase:
┌────────────────────────────────────────┐
│                                        │
│         F1 REACTION TEST               │
│  ┌─────────────────────────────────┐  │
│  │  🟢  🟢  🟢  🟢  🟢           │  │ ← All lights GREEN
│  │   (Intense glow effect)          │  │   with dramatic animation
│  └─────────────────────────────────┘  │
│                                        │
│            GO!!!                       │ ← Green glowing text
│                                        │   (pulsing animation)
│                                        │
│        ┌─────────────┐                │
│        │             │                │ ← Large green tap button
│        │  TAP NOW!   │                │   (300x300px circle)
│        │             │                │   Gradient + glow
│        └─────────────┘                │
│                                        │
└────────────────────────────────────────┘
```

### 3. Match History

```
┌────────────────────────────────────────┐
│ ← Back                                 │
│                                        │
│     📊 Match History                   │ ← Gradient title
│                                        │
│  ┌│─────────────────────────────────┐ │ ← Glass card
│  ││ ✓ WIN          0.5 WLD          │ │   Green left border
│  ││                                  │ │   (win indicator)
│  ││  ┌────────┐    ┌────────┐      │ │
│  ││  │  You   │ VS │Opponent│      │ │   Reaction comparison
│  ││  │ 234 ms │    │ 267 ms │      │ │   Winner in green glow
│  ││  └────────┘    └────────┘      │ │
│  ││                                  │ │
│  ││  vs 0x9876...  Avg: 245ms      │ │   Opponent info
│  ││                                  │ │
│  ││  Dec 27, 2025 1:30 PM          │ │   Timestamp
│  │└─────────────────────────────────┘ │
│                                        │
│  ┌│─────────────────────────────────┐ │
│  ││ ✗ LOSS         0.25 WLD         │ │   Pink left border
│  ││                                  │ │   (loss indicator)
│  ││  ┌────────┐    ┌────────┐      │ │
│  ││  │  You   │ VS │Opponent│      │ │
│  ││  │ 289 ms │    │ 201 ms │      │ │
│  ││  └────────┘    └────────┘      │ │
│  │└─────────────────────────────────┘ │
│                                        │
├────────────────────────────────────────┤
│  [ 🏠 Home ]  [ 📊 History ]  [ 🏆 ] │ ← Bottom Tab Bar
└────────────────────────────────────────┘
```

### 4. Leaderboard

```
┌────────────────────────────────────────┐
│ ← Back                                 │
│                                        │
│     🏆 Leaderboard                     │ ← Gradient title
│                                        │
│  ┌─────────────────────────────────┐  │ ← User rank card
│  │  Your Rank:         🥇          │  │   (highlighted)
│  └─────────────────────────────────┘  │
│                                        │
│  Rank│Player    │W/L │Win%│Avg Time  │ ← Table header
│  ────┼──────────┼────┼────┼─────────  │
│  🥇 │0x1234... │15/3│83%│234ms     │ ← Top 3 with medals
│  🥈 │0x5678... │12/4│75%│256ms     │   Gold filter effect
│  🥉 │0x9abc... │10/5│67%│278ms     │
│  #4 │0xdef0... │8/7 │53%│301ms     │ ← Regular entries
│                                        │
│  ┌│─────────────────────────────────┐ │
│  ││ #12 │0xabcd... YOU│7/8│47%│312ms││ │ ← Current user row
│  │└─────────────────────────────────┘ │   (Cyan border + glow)
│                                        │
│  #13 │0x1111... │6/9 │40%│345ms     │
│                                        │
├────────────────────────────────────────┤
│  [ 🏠 Home ]  [ 📊 History ]  [ 🏆 ] │ ← Bottom Tab Bar
└────────────────────────────────────────┘
```

### 5. Matchmaking

```
┌────────────────────────────────────────┐
│ ← Back                                 │
│                                        │
│     💎 PvP Staking                     │ ← Gradient title
│                                        │
│      Select Your Stake                 │
│  Winner takes 97% of pot. Fee: 3%     │
│                                        │
│  ┌────────────┐  ┌────────────┐      │ ← Stake grid
│  │   0.1 WLD  │  │   0.25 WLD │      │   (Glass cards)
│  │ Win: 0.19  │  │ Win: 0.49  │      │
│  └────────────┘  └────────────┘      │
│                                        │
│  ┌────────────┐  ┌────────────┐      │
│  │ ✓ 0.5 WLD  │  │   1.0 WLD  │      │   Selected (checkmark
│  │ Win: 0.97  │  │ Win: 1.94  │      │   + cyan border)
│  └────────────┘  └────────────┘      │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │     [ Find Opponent ]            │ │ ← Primary button
│  └──────────────────────────────────┘ │   (Full width, cyan glow)
│                                        │
│  ┌──────┐  ┌──────┐  ┌──────┐      │ ← Info cards
│  │⚡Fast│  │🎯Fair│  │🔒Secure│      │   (Glass cards)
│  │30 sec│  │Active│  │ Escrow │      │
│  └──────┘  └──────┘  └──────┘      │
└────────────────────────────────────────┘

Searching state:
┌────────────────────────────────────────┐
│                                        │
│           ⚫                           │ ← Spinner (cyan)
│                                        │
│     Finding Opponent...                │ ← Cyan glowing text
│  Searching for 0.5 WLD stake          │
│                                        │
│         ⚫  ⚫  ⚫                      │ ← Animated dots
│                                        │
│  ┌──────────────────────────────────┐ │
│  │        [ Cancel ]                │ │ ← Secondary button
│  └──────────────────────────────────┘ │
└────────────────────────────────────────┘
```

### 6. Result Screen

```
┌────────────────────────────────────────┐
│  ┌──────────────────────────────────┐ │ ← Result header
│  │         🎉 You Win!              │ │   (Green border + glow)
│  │  Your reflexes are lightning     │ │
│  │         fast! Great job!          │ │
│  └──────────────────────────────────┘ │
│                                        │
│  ┌──────────┐    ┌──────────┐       │ ← Stat comparison
│  │   You    │ VS │ Opponent │       │   (Glass cards)
│  │  234 ms  │    │  267 ms  │       │   Winner in green
│  └──────────┘    └──────────┘       │
│                                        │
│  ┌──────────────────────────────────┐ │ ← Winnings display
│  │        You Won                   │ │   (Cyan border + glow)
│  │     + 0.97 WLD                   │ │   Green text
│  └──────────────────────────────────┘ │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │     [ 🎮 Play Again ]            │ │ ← Action buttons
│  └──────────────────────────────────┘ │   (Primary cyan glow)
│  ┌──────────────────────────────────┐ │
│  │     [ 📊 View Stats ]            │ │   (Secondary pink)
│  └──────────────────────────────────┘ │
│  ┌──────────────────────────────────┐ │
│  │     [ 🏠 Dashboard ]             │ │   (Ghost outline)
│  └──────────────────────────────────┘ │
└────────────────────────────────────────┘
```

## Visual Effects

### Glassmorphism
- **Background**: Semi-transparent white (3% opacity)
- **Backdrop Filter**: 12px blur
- **Border**: 1px solid white (10% opacity)
- **Shadow**: Soft black shadow for depth

### Neon Glow Effects
```css
/* Primary (Cyan) */
text-shadow: 0 0 20px #00ffff;
box-shadow: 0 0 20px #00ffff, 0 0 40px #00ffff;

/* Success (Green) */
text-shadow: 0 0 20px #00ff88;
box-shadow: 0 0 30px rgba(0, 255, 136, 0.8);

/* Secondary (Pink) */
text-shadow: 0 0 20px #ff00ff;
box-shadow: 0 0 20px #ff00ff, 0 0 40px #ff00ff;
```

### Animations

**Pulse Glow** (Status indicators)
```
0%   → opacity: 1
50%  → opacity: 0.5
100% → opacity: 1
```

**Light Pulse** (F1 lights)
```
0%   → scale: 0.9, dim glow
50%  → scale: 1.1, bright glow
100% → scale: 1.0, medium glow
```

**Spin** (Loading)
```
0°   → 0deg rotation
360° → 360deg rotation
```

**Shine** (Button hover)
```
Gradient overlay moves left to right
Creating a "shine" effect
```

## Typography

### Headers
- Font Weight: 800-900
- Letter Spacing: 1-3px
- Text Transform: Uppercase (for labels)
- Colors: Neon with glow effects

### Body Text
- Font Weight: 400-600
- Color: White or secondary (#b0b0c0)
- Line Height: 1.6

### Monospace
- Used for: Wallet addresses, reaction times
- Font: 'Courier New', monospace

## Spacing & Layout

### Container Max Width
- Mobile: 100%
- Tablet/Desktop: 600px (Dashboard, History, Leaderboard)
- Tablet/Desktop: 800px (Leaderboard only)

### Padding Scale
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px

### Grid Layouts
- Stats: 2 columns on mobile, 4 on desktop
- Stake options: 2x2 grid
- Info cards: 1 column mobile, 3 on desktop

## Interactive States

### Hover
- Background: Slightly brighter glass
- Border: Neon color (cyan/pink)
- Shadow: Enhanced glow
- Transform: translateY(-2px to -4px)

### Active/Selected
- Border: 2px solid neon color
- Background: Neon color at 10% opacity
- Checkmark or indicator
- Enhanced glow effect

### Disabled
- Opacity: 0.5
- Cursor: not-allowed
- No hover effects

## Mobile Considerations

### Bottom Tab Bar
- Fixed position at bottom
- Safe area padding for notched devices
- Active tab highlighted
- Icon + label layout

### Touch Targets
- Minimum 44x44px
- Generous spacing between buttons
- Large tap areas for game buttons

### Responsive Breakpoints
- 480px: Mobile (stacked layouts)
- 768px: Tablet (adjusted grids)
- 769px+: Desktop (full layouts)

## Accessibility

### Contrast Ratios
- Text on dark: High contrast (white on black)
- Neon colors: Bright enough to read
- Success/Error: Clear visual distinction

### Focus Indicators
- Visible outline on keyboard focus
- Consistent across all interactive elements

### Screen Reader Support
- Semantic HTML elements
- ARIA labels where needed
- Meaningful link/button text

## Implementation Notes

1. **CSS Variables**: All colors, spacing, and effects defined in `:root`
2. **Component Library**: Reusable UI components for consistency
3. **Mobile First**: Base styles for mobile, enhanced for desktop
4. **Performance**: Hardware-accelerated animations, optimized renders
5. **Browser Support**: Modern browsers with fallbacks for older ones

---

This visual reference provides a clear picture of the redesigned UI without needing actual screenshots. The neon glassmorphism theme creates a cohesive, modern, and engaging experience throughout the application.
