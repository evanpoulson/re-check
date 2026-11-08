# Deploy

[`Caddyfile`](Caddyfile) puts HTTPS in front of the web container on the demo EC2 box. Compose mounts it into the `caddy` service when the `https` profile is on, and Caddy gets and renews a certificate for `SITE_ADDRESS`.

HTTPS is required, not optional: browsers only provide `crypto.randomUUID()` on secure origins, and the session cookies are `Secure` in production.

Setting up the box, GitHub secrets and the deploy workflow is in [`infra/README.md`](../infra/README.md).
