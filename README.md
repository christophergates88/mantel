# askcason.com

The website for Cason, the private household app for iPhone. Plain HTML, CSS and JavaScript, published by
GitHub Pages (see `.github/workflows/pages.yml`). Nothing on the site loads from other companies, and every page
carries a security policy (`connect-src 'none'`) so it can't send anything a visitor types or opens.

- `index.html`: the home page. The phone in the hero and the leak finder run in the browser with `assets/engine.js`
  (the same rules as the app's quick add and statement reader).
- `privacy.html`, `support.html`: the privacy policy and help pages Apple links to.
- `get.html`: the address in the QR code. It forwards to the App Store once there's a link.
- `assets/config.js`: **the one setting to change at launch.** Paste the App Store link into `APP_STORE_URL`
  and every "Get" button, plus `/get`, goes straight to the store.

The fonts are SF Pro Rounded on Apple devices and a self-hosted copy of Nunito elsewhere
(`assets/fonts`, SIL Open Font License).

## Simmer (`/kitchen`)

A separate, unlisted page: a slow cooker kitchen app for one household (recipes, what's in the house, a shopping
list priced for Walmart and Ingles). It keeps its data on the phone that opens it and shares it between the family's
phones through the small server in `/kitchen-worker` (photo reading, recipe writing, alerts); see the README there.
It works with no signal once it has been opened: `kitchen/sw.js` keeps a copy on the phone, and changes made offline
are combined with the other phone's when the signal is back. Walmart prices are re-read weekly as described in
`kitchen-worker/PRICES.md`.
