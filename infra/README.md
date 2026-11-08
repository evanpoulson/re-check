# Demo deployment (AWS, hackathon only)

One EC2 box in `us-west-2` runs `docker compose`. Caddy terminates HTTPS, nginx serves the React build and proxies `/api`, and FastAPI talks to the Tiger Cloud service, which is also in `us-west-2`. It is built to last the weekend, not as a pilot setup.

```
phone / staff browser ─HTTPS─► Caddy :443 ─► web (nginx) ─/api─► api (uvicorn) ─TLS─► Tiger Cloud
                                                              poller (optional) ─────────┘
```

| File | Purpose |
| --- | --- |
| `api/Dockerfile` | FastAPI image, built from the repo root because the API reads `question-bank/` at runtime. The poller reuses it. |
| `web/Dockerfile`, `web/nginx/default.conf` | Vite build with `VITE_USE_MOCKS=false`, served by nginx, `/api`, `/docs` proxied to the API |
| `compose.yaml` | `api` and `web` always; `caddy` with the `https` profile; `poller` with the `poller` profile |
| `deploy/Caddyfile` | HTTPS for `SITE_ADDRESS` |
| `infra/` | Terraform: key pair, security group (22, 80, 443), EC2 `t3.small` with Docker, Elastic IP |
| `.github/workflows/deploy.yml` | On push to `deploy`: SSH in, write `.env`, check out the commit, `docker compose up -d --build` |

## Run it locally

Put `RECHECK_DATABASE_URL` and `RECHECK_SECRET_KEY` (32+ characters) in the root `.env`, then:

```sh
RECHECK_PUBLIC_URL=http://localhost:8080 docker compose up --build
```

Open http://localhost:8080. Localhost counts as a secure origin, so no HTTPS is needed here.

## One-time setup

1. **Deploy key.** `ssh-keygen -t ed25519 -N '' -C recheck-deploy -f ~/.ssh/recheck-deploy`
2. **Box.** With AWS credentials for the credits account:
   ```sh
   cd infra
   cp terraform.tfvars.example terraform.tfvars   # paste ~/.ssh/recheck-deploy.pub
   terraform init && terraform apply
   ```
   State stays in `infra/terraform.tfstate` on whoever ran it. Keep that machine handy to destroy it later.
3. **GitHub** (Settings → Secrets and variables → Actions):

   | Kind | Name | Value |
   | --- | --- | --- |
   | Variable | `DEPLOY_HOST` | `terraform output -raw public_ip` |
   | Variable | `SITE_ADDRESS` | Optional. Leave unset to use `<ip-with-dashes>.sslip.io`, or set your own domain with an A record pointing at `DEPLOY_HOST`. |
   | Secret | `DEPLOY_SSH_KEY` | contents of `~/.ssh/recheck-deploy` (private key) |
   | Secret | `RECHECK_DATABASE_URL` | `postgres://recheck_api:...@...tsdb.cloud.timescale.com:.../tsdb?sslmode=require` |
   | Secret | `RECHECK_SECRET_KEY` | 32+ random characters. Keep it the same for the whole event, or the desk can't re-show QRs and staff are signed out. |
   | Secret | `RECHECK_POLLER_DATABASE_URL` | Optional. Set it to start the wait-time poller. |

   Avoid `$` in these values: compose treats it as a variable in `.env`.
4. **Tiger.** If the service has an IP allow list, add the Elastic IP.

## Deploy

```sh
git push origin main:deploy        # fast-forward deploy to main; the workflow does the rest
```

You can also run **Deploy** by hand from the Actions tab. The first run waits for the box's first-boot setup. Builds take a few minutes on the box, and the smoke test checks `https://$SITE_ADDRESS/api/health`.

Seed the synthetic cohort from your laptop as usual (`api/README.md`). It talks to Tiger directly, not through the box.

## When it can go wrong

- **The certificate doesn't issue.** sslip.io is shared, so Let's Encrypt rate limits can hit; Caddy then retries with ZeroSSL. If it still fails, point a real domain at the IP and set `SITE_ADDRESS`. Certificates live in the `caddy_data` volume, so redeploys don't request new ones.
- **Phones fail over HTTP.** Browsers only provide `crypto.randomUUID()` on secure origins, and the session cookies are `Secure`. Always share the `https://` URL.
- **The box runs out of memory during a build.** It has 2 GB of RAM plus 2 GB of swap. If a build is killed, set `instance_type = "t3.medium"` and re-apply.
- **Some changes replace the box.** Editing `user-data.sh` or the key does. The Elastic IP moves to the new box, so the URL and `DEPLOY_HOST` stay the same, but the box comes back empty: rerun Deploy.
- **Screens still on mocks.** With mocks off, any screen whose `/api/...` path in `web/src/api/endpoints.ts` isn't a FastAPI route yet will fail.
- **Logs.** `ssh -i ~/.ssh/recheck-deploy ubuntu@$DEPLOY_HOST 'cd re-check && docker compose logs -f'`

## Tear down

```sh
cd infra && terraform destroy
```

Then delete the `deploy` branch and the deploy key.
