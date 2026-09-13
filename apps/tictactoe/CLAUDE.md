# multidtictactoe

Expo (React Native + TypeScript) app: the smallest of the three multiverse
games, and the tutorial for the other two. See README.md for the rules.

- Engine lives in `src/engine` and must stay free of React/React Native imports.
- Boards are immutable; every rule function returns a new value.
- `npm test` runs the jest-expo unit tests, `npm run typecheck` runs tsc.
- Exact versioned Expo docs: https://docs.expo.dev/versions/v57.0.0/
