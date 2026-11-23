# DIY Guy

diy-guy.co.uk with online booking. New bookings go to Telegram.

## Deploy on Render (web service, not static)
- Build command: `npm install`  Start command: `npm start`
- Environment variables: see `.env.example`
- Postgres: any Render Postgres works. Tables are prefixed `diy_` so it can share a database with another site.

## Telegram
Use the same bot as The Plumbing and Water Company (messages start with "DIY Guy booking") or make a new one with @BotFather.
Put `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in Render.

## Change things
Prices, hours, days open: `lib/config.js`. Bookings and days off: `/admin`.
