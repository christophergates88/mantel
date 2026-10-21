// /get (the QR code's address): go straight to the App Store once Torvard is live.
import { APP_STORE_URL } from './config.js';

if (APP_STORE_URL) {
  window.location.replace(APP_STORE_URL);
}
