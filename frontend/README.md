# PhysioDesk — frontend

Next.js (App Router) + TypeScript + Tailwind CSS v4.

## Run locally

```bash
npm install
cp .env.example .env.local     # points at http://localhost:8000 by default
npm run dev
```

Open <http://localhost:3000>. The backend must be running — see the
[repository README](../README.md).

## Layout

```
src/
├── app/
│   ├── (auth)/login/     # unauthenticated route group
│   ├── (app)/            # everything behind the auth guard
│   ├── layout.tsx        # fonts + providers
│   └── globals.css       # design tokens and Tailwind theme
├── components/
│   ├── shell/            # sidebar, top bar
│   └── ui/               # buttons, cards, loading/empty/error states
└── lib/
    ├── api.ts            # typed fetch client
    ├── auth.tsx          # auth context and route guard
    ├── format.ts         # date and currency formatting
    └── types.ts          # domain types mirroring the API
```
