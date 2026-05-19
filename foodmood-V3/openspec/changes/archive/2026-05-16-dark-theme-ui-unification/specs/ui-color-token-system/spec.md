## ADDED Requirements

### Requirement: Semantic color tokens defined in CSS

The system SHALL define all UI colors as CSS custom properties (semantic tokens) in `src/index.css` under the `@theme {}` block. No component SHALL use hardcoded hex color values for surfaces, text, or borders. Accent colors (`#C04A3B`, `#4A6B5D`, `#D98A5B`) MAY remain hardcoded where they appear as deliberate brand highlights.

#### Scenario: Token definitions present

- **WHEN** `src/index.css` is inspected
- **THEN** the following tokens SHALL be defined under `@theme {}`: `--color-bg`, `--color-surface`, `--color-card`, `--color-text-primary`, `--color-text-secondary`, `--color-border`, `--color-border-subtle`

##### Example: token values for dark theme

| Token | Value | Usage |
|---|---|---|
| `--color-bg` | `#1A1714` | Outermost page background |
| `--color-surface` | `#1E1C1A` | Sidebar, mobile header |
| `--color-card` | `#252220` | Card backgrounds |
| `--color-text-primary` | `#F0EAE0` | Headings, body text |
| `--color-text-secondary` | `#B5A99E` | Subtitles, labels |
| `--color-border` | `#3A3330` | Card and section borders |
| `--color-border-subtle` | `#2E2B28` | Dividers, inner borders |

### Requirement: WCAG AA contrast ratio for text

All text SHALL meet WCAG 2.1 AA contrast ratio requirements:
- Body/heading text (primary) on card background: contrast ratio SHALL be ≥ 4.5:1
- Secondary/label text on card background: contrast ratio SHALL be ≥ 4.5:1

#### Scenario: Primary text contrast on card

- **WHEN** `--color-text-primary` (`#F0EAE0`) is rendered on `--color-card` (`#252220`)
- **THEN** the contrast ratio SHALL be ≥ 4.5:1

##### Example: contrast calculation

- **GIVEN** foreground `#F0EAE0` (relative luminance ≈ 0.847), background `#252220` (relative luminance ≈ 0.018)
- **WHEN** contrast ratio is computed as (L1 + 0.05) / (L2 + 0.05)
- **THEN** result ≈ 13.2:1 — passes AA

#### Scenario: Secondary text contrast on card

- **WHEN** `--color-text-secondary` (`#B5A99E`) is rendered on `--color-card` (`#252220`)
- **THEN** the contrast ratio SHALL be ≥ 4.5:1

##### Example: contrast calculation

- **GIVEN** foreground `#B5A99E` (relative luminance ≈ 0.44), background `#252220` (relative luminance ≈ 0.018)
- **WHEN** contrast ratio is computed
- **THEN** result ≈ 5.7:1 — passes AA

### Requirement: Consistent dark background across all views

All views (HomeView, AlmanacView, InsightView, ProfileView), modals (RecordModal, ResultModal, FortuneSlip), and navigation components (sidebar, mobile header, bottom nav) SHALL use the semantic token classes. No view SHALL render a white or near-white (`#FAF8F5`, `#FFFFFF`, `#F4EFE6`) background as a page-level surface.

#### Scenario: HomeView renders dark background

- **WHEN** the app renders on mobile
- **THEN** `main` element background SHALL use `--color-surface` (dark), not `bg-[#FAF8F5]`

#### Scenario: Desktop and mobile backgrounds are consistent

- **WHEN** the app renders on desktop (md breakpoint and above)
- **THEN** `main` element SHALL NOT be `md:bg-transparent`; it SHALL use an explicit dark surface token

### Requirement: gitignore excludes generated directories

The `.gitignore` file SHALL contain entries for `node_modules/`, `dist/`, and `.env` to prevent accidental commits of generated artifacts.

#### Scenario: node_modules excluded

- **WHEN** a developer runs `git status` after `npm install`
- **THEN** the `node_modules/` directory SHALL NOT appear as untracked files
