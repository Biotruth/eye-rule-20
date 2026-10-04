# Eye Rule 20

A customizable eye-break timer for making space between screen sessions. Built with Expo, React Native, and TypeScript.

## What it does

- Alternates between work periods and short breaks, with 20-minute work periods and 20-second breaks by default.
- Offers always-on reminders and manually controlled sessions.
- Supports optional active hours and selected weekdays.
- Includes pause, resume, and notification snooze controls.
- Saves settings and timer state locally and tracks completed cycles for the day.
- Provides configurable sound, vibration, and keep-awake settings.

## Run locally

Use Node.js 24 and npm, then run:

```sh
npm ci
npm start
```

The project also provides these commands:

| Command | Purpose |
| --- | --- |
| `npm run ios` | Build and run the native iOS app; requires Xcode on macOS. |
| `npm run android` | Build and run the native Android app; requires an Android development environment. |
| `npm run web` | Start the web preview. |
| `npm run check` | Run TypeScript checks and JavaScript regression tests. |

Native notifications require permission on the device. Use a native build to assess reminder behavior; the web preview does not verify native notification delivery.

## How the timer works

The countdown is derived from a saved timestamp:

```text
remaining time = phase start + phase duration - current time
```

This avoids relying on one-second ticks while a phone suspends the app. `reconcileNow` brings saved state up to date when the app runs again. Pausing stores the remaining duration; resuming reconstructs the phase start so the timer picks up where it stopped.

Local notifications use a repeating work reminder plus eight upcoming break-completion slots. Stable identifiers allow rescheduling without accumulating requests. Notification permission is checked before scheduling.

### Current limitations

- The repeating work reminder is a coarse fallback; it can differ from the foreground timer after a pause or schedule change.
- Break-completion alerts cover a finite window that is refreshed when the app runs again.
- Snoozing temporarily replaces the repeating reminder with a one-shot alert. Restoring the repeating schedule requires the app to run again after snooze expiry.
- Notification actions open the app to process the response.
- Overnight active-hour windows are not supported.

## Quality checks

JavaScript tests exercise the actual TypeScript scheduling helpers: boundary times, disabled days, week rollover, daylight-saving transitions, and time formatting. GitHub Actions runs type checking and tests in UTC and America/Los_Angeles on pushes and pull requests. These checks do not replace testing notification delivery on physical iOS and Android devices.

## Project structure

- `app/` — routes, home screen, and settings.
- `src/components/` — timer views, onboarding, and shared controls.
- `src/timer/` — timer state and active-hours logic.
- `src/notifications/` — local reminder scheduling and actions.
- `src/storage/` — local persistence.
- `src/constants/` — defaults, theme, and break prompts.

## License

See [LICENSE](LICENSE) for the included MIT license and copyright notice.
