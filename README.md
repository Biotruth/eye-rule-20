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

Install Node.js and npm compatible with the project's Expo SDK, then run:

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
| `npx tsc --noEmit` | Check TypeScript types. |

Native notifications require permission on the device. Use a native build to assess reminder behavior; the web preview does not verify native notification delivery.

## Project structure

- `app/` — routes, home screen, and settings.
- `src/components/` — timer views, onboarding, and shared controls.
- `src/timer/` — timer state and active-hours logic.
- `src/notifications/` — local reminder scheduling and actions.
- `src/storage/` — local persistence.
- `src/constants/` — defaults, theme, and break prompts.

## License

See [LICENSE](LICENSE) for the included MIT license and copyright notice.
