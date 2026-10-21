# homesake.app

The website for Homesake, the private household app for iPhone. Plain HTML, CSS and JavaScript, published by
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
