# Key Setup Wizard — Design Spec

Replace the flat key configuration form with a step-by-step wizard and add template/suggestion systems to make key setup intuitive for any user.

## Context

The current KeyConfig component is a flat form requiring manual text entry for exe paths, process names, profile names, and URLs. There's no validation, no file pickers, and no guidance for users who don't know what to configure. This spec introduces a wizard flow, grid-level templates, and per-key suggestions.

## Audience

General users — the UI must be self-explanatory without documentation.

## Design Decisions

- **Step-by-step wizard** over flat form — progressive disclosure prevents overwhelm
- **Extensible action cards** — new action types just add a card to Step 1
- **Templates + per-key suggestions** — dual-layer guidance for "show me what's possible" users
- **Installed app detection** — PowerShell scan of Start Menu shortcuts, cached at startup
- **Bundled suggestion data** — templates and popular app/URL suggestions ship as a JSON file

## Wizard Flow

The wizard replaces the right panel (currently KeyConfig) when a key is selected.

### Step 1: Choose Action

Visual cards, one per action type:

| Card | Title | Description |
|------|-------|-------------|
| 🖥️ | Launch App | Open or focus an application |
| 🌐 | Open URL | Open or focus a web page |
| 📁 | Switch Profile | Jump to a specific profile |
| 🔄 | Cycle Profiles | Step through profiles in order |

Clicking a card advances to Step 2. New action types (hotkeys, media controls, scripts) will be added as additional cards here — no structural changes needed.

### Step 2: Configure Target

Context-sensitive based on the action type selected in Step 1:

**App (Launch App):**
- Searchable list of detected installed apps (from Start Menu scan) — text filter input at top, matches against display name
- "Popular Apps" section with curated entries (VS Code, Slack, Spotify, etc.)
- "Browse..." button using Electron's `dialog.showOpenDialog` with `.exe` filter
- Selecting from any source auto-fills both process name and exe path

**URL (Open URL):**
- Category tabs: Work, Social, Entertainment, Dev Tools
- Popular services per category (Gmail, GitHub, YouTube, Notion, etc.)
- Custom URL text input with validation (must be a valid URL)

**Profile (Switch Profile):**
- Dropdown of existing profile names
- "+ New Profile" inline option

**Cycle Profiles:**
- No target needed — skip directly to Step 3

### Step 3: Label & Colors

- **Label:** text input, auto-suggested from the app name or URL domain
- **Active Color:** color picker for the key's idle LED color
- **Press Color:** color picker for the LED color when physically pressed (defaults to white)
- **Live preview:** the selected key in the grid updates in real-time as values change; if the Keybow is connected, the physical LED also updates

### Step 4: Review & Save

Summary card showing:
- Action type with icon
- Target (app name + path, URL, or profile name)
- Label
- Color swatches (active + press)

Actions:
- **Save** — commits the key binding to the active profile
- **Back** — return to previous step
- **Cancel** — discard all changes
- **Remove Key** — delete the existing binding (only shown for configured keys)

### Navigation

- Back/Next buttons with step indicator dots (4 dots)
- "Next" is disabled until required fields are filled
- Completed dots are clickable to jump back to any earlier step
- Step 4's "Next" button becomes "Save"

## Template Picker

Accessible from a **"Templates" button** in the ProfileBar.

Opens a **modal overlay** with template cards:

| Template | Description |
|----------|-------------|
| Developer | VS Code, Terminal, Browser, GitHub, Docker, DB client + build/deploy shortcuts |
| Productivity | Email, Calendar, Slack, Teams, Notes, File Manager + common URLs |
| Creative | Photoshop, Figma, Premiere, Blender, Spotify + reference URLs |
| Gaming | Steam, Discord, OBS, Twitch + streaming URLs |

Applying a template **creates a new profile** pre-filled with key bindings. The user can then customize any individual key via the wizard.

Templates are defined in a bundled JSON file (`electron/src/data/templates.json`) for easy updates and community contributions.

## Per-Key Suggestions

Suggestions appear inline within wizard Step 2, contextual to the chosen action type:

- **Apps:** detected installed apps + popular picks + file browser fallback
- **URLs:** popular services by category + custom input with validation
- **Profiles:** dropdown of existing profiles

### Installed App Detection

At app startup, run a PowerShell script via `execFile` to scan Start Menu shortcuts (`.lnk` files) and extract:
- Display name
- Target exe path

- Process name (derived from exe filename)

Results are cached in memory for the session. No persistent storage needed — the scan is fast enough to run on each launch.

## Integration with Existing UI

### Layout

No layout changes — the wizard replaces the existing KeyConfig panel on the right side. The ProfileBar gains a "Templates" button on the right end.

```
┌─────────────────────────────────────────────┐
│ ProfileBar  [Default] [Gaming] [+]  [📋 Templates] │
├──────────────┬──────────────────────────────┤
│              │                              │
│   KeyGrid    │   Wizard Panel               │
│   (4x4)     │   (replaces KeyConfig)       │
│              │                              │
│              │                              │
└──────────────┴──────────────────────────────┘
```

### Interaction Model

| Action | Result |
|--------|--------|
| Click empty key | Wizard opens at Step 1. Key gets a highlight ring in the grid. |
| Click configured key | Wizard opens at Step 4 (Review) with current config. Edit buttons jump to any step. |
| Click different key mid-edit | Unsaved-changes prompt, then switch to new key. |
| Press Escape / click Cancel | Wizard closes, right panel shows empty state. |
| No key selected | Right panel shows empty state: "Click a key to configure it, or use Templates to set up the whole grid." |

### Live Preview

During Step 3 (Label & Colors):
- The key tile in the grid updates color and label in real-time
- If a Keybow is connected via serial, send LED color commands to preview on the physical device
- Changes are not persisted until Save is clicked

## Data Files

| File | Purpose |
|------|---------|
| `electron/src/data/templates.json` | Grid-level template definitions |
| `electron/src/data/suggestions.json` | Popular apps and URLs for per-key suggestions |

Both are bundled with the app and can be updated independently of code changes.

## Out of Scope

- Drag-and-drop key reordering
- Multi-key bulk editing
- Undo after save
- Import/export profiles (may be a separate feature)
- Custom action types beyond the four defined here (extensibility is designed in, but implementation of new types is future work)
