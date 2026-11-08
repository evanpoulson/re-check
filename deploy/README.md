# Deploy

[`Caddyfile`](Caddyfile) puts HTTPS in front of the web container on the demo EC2 instance. Compose mounts it into the `caddy` service when the `https` profile is on. Caddy gets and renews a certificate for `SITE_ADDRESS`.

The demo must use HTTPS. Browsers give `crypto.randomUUID()` only on secure origins, and the session cookies are `Secure` in production.

[`infra/README.md`](../infra/README.md) tells how to set up the instance, the GitHub secrets and the deploy workflow.
