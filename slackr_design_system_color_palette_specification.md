# SLACKR Design System Specification

## Brand Overview
- **Name:** SLACKR (PHILNITS / FE & AP Exam Reviewer)
- **Concept:** Offline-first, friction-free study workspace with spaced repetition, deep analytics, and editorial clarity.
- **Mascot / Emblem:** The Slackr Koala — a sleeping koala clutching a giant technical pencil (symbolizing unhurried, focused pacing and calm stamina).
- **Aesthetic Direction:** Two balanced modes — **"Paper & Precision"** (Light Theme) and **"Cyber-Academic Focus"** (Dark Theme).

---

## 1. Color Palette System

Based on the Material Design 3 Organic Olive/Forest architectural palette (`color_hue_hex_reference.md`).

### 1.1 Core Semantic Tokens

| Role | Token | HEX Code | Hue (° HSV) | Intended Usage & Meaning |
| :--- | :--- | :--- | :--- | :--- |
| **Primary** | `P-40` | `#396A1E` | 99° | Deep Forest Olive. Primary buttons, verified answers, active icons, brand headers. |
| **On Primary** | `P-100` | `#FFFFFF` | — | Text/icon color over Primary surfaces. |
| **Primary Container** | `P-90` | `#B9F399` | 99° | Light/vibrant lime tint. Soft badges, success container fills, active pills. |
| **On Primary Container** | `P-10` | `#072100` | 107° | Deep forest dark text over Primary Containers. |
| **Secondary** | `S-40` | `#56624C` | 93° | Muted olive sage. Secondary buttons, question tags, progress rails. |
| **On Secondary** | `S-100` | `#FFFFFF` | — | Text/icons over Secondary surfaces. |
| **Secondary Container** | `S-90` | `#D9E7CB` | 90° | Soft sage container. Question category pills, secondary callout backgrounds. |
| **On Secondary Container**| `S-10` | `#131F0E` | 102° | High-contrast dark text over Secondary Containers. |
| **Tertiary** | `T-40` | `#396667` | 181° | Slate Teal / Cyan. Technical metadata, time pacing, formulas, links. |
| **On Tertiary** | `T-100` | `#FFFFFF` | — | Text/icons over Tertiary surfaces. |
| **Tertiary Container** | `T-90` | `#BCEBED` | 182° | Soft cyan. Pace chips (`Optimal pace`), AI explanation prompts, drool bubble accent. |
| **On Tertiary Container** | `T-10` | `#002020` | 180° | Deep teal dark text over Tertiary Containers. |
| **Error** | `E-40` | `#B91A19` | 0° | Crimson Red. Incorrect option picks, error rate alerts, destructive reset actions. |
| **On Error** | `E-100` | `#FFFFFF` | — | Text/icons over Error surfaces. |
| **Error Container** | `E-90` | `#FEDAD6` | 6° | Soft blush red. "Incorrect Choice" banners, distractor trap highlight boxes. |
| **On Error Container** | `E-10` | `#400102` | 359° | Dark burgundy text over Error Containers. |

---

### 1.2 Neutral & Surface Tokens (Light Mode — "Paper & Precision")

| Token | HEX Code | Hue (° HSV) | Role |
| :--- | :--- | :--- | :--- |
| **Surface** / **Background** | `#F8FAF0` | 72° | Base canvas page background (warm paper texture feeling). |
| **Surface Dim** | `#DADBD2` | 67° | Inactive controls, subtle borders, dimmed backgrounds. |
| **Surface Container Lowest**| `#FFFFFF` | — | Primary elevated cards, question sheets, breakdown modules. |
| **Surface Container Low** | `#F3F5EB` | 72° | Secondary background, sidebar card panels. |
| **Surface Container** | `#EEEFE5` | 66° | Table headers, chip containers, code block backdrops. |
| **Surface Container High** | `#E8E9E0` | 67° | Elevated interactive chips, hover states. |
| **Surface Container Highest**| `#E2E3DA` | 67° | Dividers, active borders, disabled states. |
| **On Surface** | `#191C19` | 120° | Primary body text, headings (very dark forest slate). |
| **On Surface Variant** | `#43493E` | 93° | Secondary captions, subheadings, metadata labels. |
| **Outline** | `#757A6D` | 83° | Card borders, table grid lines, input outlines. |
| **Outline Variant** | `#C3C8BB` | 83° | Delicate card borders, subtle inner separator lines. |

---

### 1.3 Dark Mode Tokens ("Cyber-Academic Focus")

| Role | HEX Code | Intended Usage |
| :--- | :--- | :--- |
| **Background / Canvas** | `#090D16` | Deep obsidian midnight canvas. |
| **Surface Card** | `#0F172A` / `#1E293B` | Elevated study cards, quiz option blocks. |
| **Border / Stroke** | `#334155` / `rgba(255,255,255,0.08)` | Subtle translucent glass card outlines. |
| **Luminous Primary** | `#84D656` | Bright emerald lime for active items and verified answers. |
| **Luminous Accent** | `#A6F178` | Highlight curves, Koala dark-mode line art. |
| **Text Primary** | `#F8FAFC` | Crisp heading and formula text. |
| **Text Muted** | `#94A3B8` | Explanatory labels, timer notations, hotkey tags. |

---

## 2. Typography & Formatting Rules

- **Primary Typeface:** `Plus Jakarta Sans`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, sans-serif.
- **Monospace Typeface:** `JetBrains Mono`, `Fira Code`, `ui-monospace`, `monospace`.
  - Used for: Question IDs (`Q59`, `2026S_FE-A_1`), LaTeX math variables, hotkeys (`[1]`, `[Enter]`, `[Space]`), timers (`00m 04s`), and code snippets.
- **Mathematical Equations:** Rendered via **KaTeX** / **LaTeX** ($P - VC$, $\frac{FC + \pi}{P - VC}$, matrices, truth tables). Equations must be rendered in dedicated, spacious cards with high line height, never crammed inline with body copy.

---

## 3. UI/UX Principles & Layout Structure

### 3.1 Unjammed, Spacious Problem Derivations
Breakdowns must follow a 5-stage progressive disclosure framework:
1. **01. Objective & Taxonomy:** Curriculum domain (`Management & Cost Analysis`), syllabus standard, target variable.
2. **02. Given Information / State Table:** Extracted variables in compact metric chips + structured parameter table.
3. **03. Step-by-Step Derivation:** Numbered deductive progression with formula boxes and intermediate arithmetic.
4. **04. Verified Conclusion & Rule of Thumb:** Key validation badge plus an actionable exam mnemonic.
5. **05. Distractor & Trap Analysis:** Diagnostic analysis of wrong options (`Break-even Trap`, `Variable Blindness`, etc.) with an editable Markdown community note box.

### 3.2 Diagram Viewing System
- Never use CSS hover zoom (`:hover scale`) on diagrams to avoid hover-jitter loops.
- Use an inline scrollable container with docked physical zoom buttons: `[+]`, `[-]`, `100%`, `[↺ Reset]`, and `[⛶ Fullscreen Lightbox]`.

### 3.3 Keyboard-First Review Velocity
- Options selectable via `1-4` or `A-D`.
- Advance questions via `Enter` or `Space`.
- Modal close via `Escape`.

---

## 4. Brand Mascot Asset Guidelines (The Slackr Koala)

- **Light Mode Mascot (`#396A1E`):** Thick forest olive outlines, soft sage inner ear accents (`#D9E7CB`), pale mint drool drop (`#BCEBED`), and a pencil with a soft red eraser badge (`#B91A19`).
- **Dark Mode Mascot (`#84D656`):** Luminous lime line work, dark graphite core (`#142111`), transparent background.
