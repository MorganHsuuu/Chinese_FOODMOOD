## ADDED Requirements

### Requirement: Splash shown on every app open

The app SHALL display the opening splash screen on every launch, regardless of whether a user session is already stored in localStorage.

#### Scenario: Returning user sees splash on launch

- **WHEN** the app is opened and a valid user profile exists in localStorage
- **THEN** the splash screen is displayed with the full opening animation (fade-in background image, corner accents, bottom content slide-up)

#### Scenario: New user sees splash on launch

- **WHEN** the app is opened and no user profile exists in localStorage
- **THEN** the splash screen is displayed identically, with the "開始修行" wax-seal button

### Requirement: Returning user entry button shows personalized welcome

When a logged-in user's profile is available, the splash bottom section SHALL replace the "開始修行" wax-seal button with a personalized welcome button that shows the user's nickname.

#### Scenario: Personalized button displayed

- **WHEN** the splash screen is shown and `existingProfile.nickname` is non-empty
- **THEN** the bottom button area displays "歡迎回來，[nickname]" text and a tap-to-enter button instead of the "開始修行" wax-seal

#### Scenario: Nickname is empty string

- **WHEN** the splash screen is shown and `existingProfile` exists but `nickname` is an empty string
- **THEN** the button area displays "歡迎回來" without a name suffix

#### Scenario: Tap welcome button enters main app

- **WHEN** the user taps the "歡迎回來" button on the splash screen
- **THEN** the splash fade-out animation plays (600ms) and the main app renders with the existing session profile loaded

##### Example: login state transitions

| Stored session | Splash button shown | After tap |
|---|---|---|
| `{ nickname: "阿明", ... }` | 歡迎回來，阿明 | Main app with profile = 阿明's profile |
| `{ nickname: "", ... }` | 歡迎回來 | Main app with the stored profile |
| `null` (none) | 開始修行 / Commence Journey | Registration form |

### Requirement: LoginGate accepts existingProfile prop

`LoginGate` SHALL accept an `existingProfile` prop of type `null | { nickname, email, gender, age }`. When `existingProfile` is `null`, `LoginGate` SHALL behave identically to the current implementation.

#### Scenario: No existingProfile — form flow unchanged

- **WHEN** `LoginGate` is rendered with `existingProfile={null}`
- **THEN** splash → "開始修行" button → registration form flow is identical to the pre-change behavior

#### Scenario: existingProfile provided — form is never shown

- **WHEN** `LoginGate` is rendered with a non-null `existingProfile`
- **THEN** the registration form (`step === 'form'`) is never rendered; tapping the welcome button calls `onLogin(existingProfile)` directly
