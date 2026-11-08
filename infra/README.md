# Demo deployment (AWS, hackathon only)

One EC2 instance in `us-west-2` runs `docker compose`. Caddy terminates HTTPS. nginx serves the React build and sends `/api` to FastAPI. FastAPI connects to the Tiger Cloud service, which is also in `us-west-2`. This setup is for the event weekend. It is not a pilot setup.

```
phone / staff browser ─HTTPS─► Caddy :443 ─► web (nginx) ─/api─► api (uvicorn) ─TLS─► Tiger Cloud
                                                              poller (optional) ─────────┘
```

| File | Purpose |
| --- | --- |
| `api/Dockerfile` | FastAPI image. It builds from the repository root, because the API reads `question-bank/` at runtime. The poller uses the same image. |
| `web/Dockerfile`, `web/nginx/default.conf` | Vite build with `VITE_USE_MOCKS=false`, served by nginx. nginx sends `/api` and `/docs` to the API. |
| `compose.yaml` | `api` and `web` always run. `caddy` runs with the `https` profile. `poller` runs with the `poller` profile. |
| `deploy/Caddyfile` | HTTPS for `SITE_ADDRESS` |
| `infra/` | Terraform: key pair, security group (22, 80, 443), EC2 `t3.small` with Docker, Elastic IP |
| `.github/workflows/deploy.yml` | On a push to `deploy`: connects with SSH, writes `.env`, checks out the commit, runs `docker compose up -d --build` |

## Run it locally

1. Put `RECHECK_DATABASE_URL` and `RECHECK_SECRET_KEY` (32+ characters) in the root `.env`.
2. Run:

   ```sh
   RECHECK_PUBLIC_URL=http://localhost:8080 docker compose up --build
   ```

3. Open http://localhost:8080. Browsers treat localhost as a secure origin, so you do not need HTTPS here.

## One-time setup

1. **Deploy key.** Run `ssh-keygen -t ed25519 -N '' -C recheck-deploy -f ~/.ssh/recheck-deploy`.
2. **Instance.** Use AWS credentials for the credits account:

   ```sh
   cd infra
   cp terraform.tfvars.example terraform.tfvars   # paste ~/.ssh/recheck-deploy.pub
   terraform init && terraform apply
   ```

   The state stays in `infra/terraform.tfstate` on the computer that ran `apply`. Keep that computer available, because you need it to destroy the instance.
3. **GitHub.** Go to Settings → Secrets and variables → Actions, and add these values:

   | Kind | Name | Value |
   | --- | --- | --- |
   | Variable | `DEPLOY_HOST` | `terraform output -raw public_ip` |
   | Variable | `SITE_ADDRESS` | Optional. If not set, the workflow uses `<ip-with-dashes>.sslip.io`. For your own domain, set it here and add an A record to `DEPLOY_HOST`. |
   | Secret | `DEPLOY_SSH_KEY` | The private key `~/.ssh/recheck-deploy` |
   | Secret | `RECHECK_DATABASE_URL` | `postgres://recheck_api:...@...tsdb.cloud.timescale.com:.../tsdb?sslmode=require` |
   | Secret | `RECHECK_SECRET_KEY` | 32+ random characters. Keep one value for the full event. If it changes, the desk cannot show QRs again and all staff are signed out. |
   | Secret | `RECHECK_POLLER_DATABASE_URL` | Optional. Set it to start the wait-time poller. |
   | Variable | `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID` | Staff sign-in (see `auth0/README.md`) |
   | Secret | `AUTH0_CLIENT_SECRET` | Staff sign-in |
   | Variable | `RECHECK_SCHEDULER_SECONDS` | Optional. The default is `15`, so this instance runs the missed check-in and escalation timers. `0` turns them off. Keep the timers off on all other computers that use the same database. |
   | Variable | `RECHECK_DEMO_STAFF` | Optional. `true` shows the demo role picker next to Auth0 sign-in. |

   Do not use `$` in these values. Compose reads `$` in `.env` as a variable.
4. **Auth0.** In the Auth0 application, add `https://<SITE_ADDRESS>/api/staff/callback` as a callback URL. Add `https://<SITE_ADDRESS>/staff/sign-in` as a logout URL.
5. **Tiger Cloud.** If the service has an IP allow list, add the Elastic IP.

## Deploy

```sh
git push origin main:deploy        # moves deploy to main. The workflow does the rest.
```

You can also start **Deploy** manually from the Actions tab.

- The first run waits for the first-boot setup of the instance.
- Builds take a few minutes on the instance.
- The smoke test checks `https://$SITE_ADDRESS/api/health`.

Load the synthetic cohort from your computer as usual (see `api/README.md`). The loader connects to Tiger Cloud directly, not through the instance.

## Troubleshooting

| Problem | Cause and fix |
| --- | --- |
| The certificate does not issue | sslip.io is shared, so Let's Encrypt rate limits can apply. Caddy then tries ZeroSSL. If this also fails, point a real domain at the IP and set `SITE_ADDRESS`. Certificates stay in the `caddy_data` volume, so a redeploy does not request new ones. |
| Phones fail over HTTP | Browsers give `crypto.randomUUID()` only on secure origins, and the session cookies are `Secure`. Always share the `https://` URL. |
| A build stops because memory is low | The instance has 2 GB of RAM and 2 GB of swap. Set `instance_type = "t3.medium"` and apply again. |
| The instance is empty after `terraform apply` | A change to `user-data.sh` or to the key replaces the instance. The Elastic IP moves to the new instance, so the URL and `DEPLOY_HOST` stay the same. Run **Deploy** again. |

To see the logs, run `ssh -i ~/.ssh/recheck-deploy ubuntu@$DEPLOY_HOST 'cd re-check && docker compose logs -f'`.

## Tear down

1. Run `cd infra && terraform destroy`.
2. Delete the `deploy` branch and the deploy key.
