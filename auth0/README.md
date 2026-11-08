# Auth0 staff sign-in

Staff sign in with Auth0. Patients and companions do not: they use the visit's QR token.

- **Team:** single sign-on with Google or GitHub. Only emails on the staff list can sign in. Microsoft isn't set up: it needs an Azure (Entra) directory to register the app.
- **Judges:** demo email-and-password accounts, one for each role. Public sign-up is off. Put the emails and passwords in the Devpost notes.
- **Roles:** each account has one fixed role. The Action in `post-login-action.js` adds the role to the ID token. The API reads it and enforces it on every staff route.

The API is the OAuth client (authorization code flow with PKCE). Auth0's tokens stay on the server. The browser gets only Recheck's signed HttpOnly `recheck_staff` cookie. See `api/src/recheck/oidc.py`.

## Set up the tenant

1. Create a tenant. Note its domain, for example `recheck.ca.auth0.com`.
2. **Applications → Create Application → Regular Web Application.** In **Settings**:
   - Allowed Callback URLs: `http://localhost:5173/api/staff/callback, https://<deployed-web-host>/api/staff/callback`
   - Allowed Logout URLs: `http://localhost:5173/staff/sign-in, https://<deployed-web-host>/staff/sign-in`
   - Copy the Domain, Client ID and Client Secret.
3. **Authentication → Social.** Turn on Google and GitHub for the application, each with your own client ID and secret (Auth0's developer keys are for quick tests only). Each provider sends people back to `https://<tenant-domain>/login/callback`.
   - **Google:** Google Cloud Console → Google Auth Platform. Create the branding (External), then a **Web application** client with that redirect URI. While the app is in **Testing**, only listed test users can sign in: add each staff member's Google email under **Audience → Test users**, as well as to `STAFF_ROLES`.
   - **GitHub:** GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**, with that callback URL. In Auth0, turn on the **Email address** attribute, or Auth0 gets no email for accounts with a private email. A staff member's GitHub primary email must match their `STAFF_ROLES` entry.
4. **Authentication → Database → Username-Password-Authentication.** Turn on **Disable Sign Ups**. Enable the connection for the application.
5. **User Management → Users → Create User** in the database connection. Make one account for each judge role, for example `judge-triage@recheck.demo` and `judge-physician@recheck.demo`. Use long random passwords.
6. **Actions → Library → Create Action** (Login / Post Login). Paste `post-login-action.js`. Add the secrets:
   - `RECHECK_CLIENT_ID`: the Client ID from step 2.
   - `STAFF_ROLES`: JSON, email to role. Include the team's SSO emails and the judge accounts:

     ```json
     {"you@gmail.com": "charge_nurse", "judge-triage@recheck.demo": "triage_nurse", "judge-physician@recheck.demo": "physician"}
     ```

   Deploy the Action. In **Actions → Triggers → post-login**, drag it into the flow and apply.
7. Put the settings in the repository's root `.env` (see `api/README.md`):

   ```sh
   AUTH0_DOMAIN=recheck.ca.auth0.com
   AUTH0_CLIENT_ID=...
   AUTH0_CLIENT_SECRET=...
   ```

To add or remove a staff member, edit `STAFF_ROLES` and deploy the Action again. A role change takes effect at the next sign-in.

## Check it

1. Open `http://localhost:5173/api/staff/login?return_to=/staff/triage`. Sign in with a listed account. You land on `/staff/triage`.
2. `GET /api/staff/session` shows your Auth0 user ID, name and role.
3. Sign in with an account that is not on the list. You return to `/staff/sign-in?error=access_denied`.
4. Open `/api/staff/logout`. You return to the sign-in page, and the next sign-in asks for an account again.

`/api/staff/...` must be on the same origin as the web app, because the cookies are first-party. In development, Vite must proxy `/api` to FastAPI.
