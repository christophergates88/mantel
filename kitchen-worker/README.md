# Simmer photo reader

The small private server behind the photo buttons in `/kitchen` (Simmer). It takes a photo of the fridge, pantry
or a receipt, asks a vision model what food is in it, and sends back a list. Photos are not stored.

It is not switched on until it is deployed to Cloudflare:

1. In the Cloudflare dashboard: Workers & Pages, Create, Import a repository, pick `christophergates88/mantel`,
   and set the root directory to `kitchen-worker`. Deploy.
2. Copy the address it gives (it ends in `.workers.dev`) into `kitchen/config.js` as `READER_URL`.
3. Optional, for better reading: add a secret named `ANTHROPIC_API_KEY`. Without it the reader uses
   Cloudflare's own vision model, which needs no key.

Limits: only the Simmer page can call it, and it stops at 40 reads a day (`MAX_READS_PER_DAY`).
