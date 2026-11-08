# Auth0 staff sign-in

Staff sign in with Auth0. Patients and companions do not use Auth0. They use the QR token of the visit.

- **Team.** Single sign-on with Google or GitHub. Only emails on the staff list can sign in. Microsoft is not set up, because it needs an Azure (Entra) directory to register the app.
- **Judges.** Demo email-and-password accounts, one for each role. Public sign-up is off. See [Judge logins](#judge-logins).
- **Roles.** Each account has one fixed role. The Action in `post-login-action.js` adds the role to the ID token. The API reads the role and enforces it on each staff route.

The API is the OAuth client (authorization code flow with PKCE). Auth0 tokens stay on the server. The browser gets only the signed HttpOnly `recheck_staff` cookie from Recheck. See `api/src/recheck/oidc.py`.

## Judge logins

1. Open https://hackedthechangeyyc.health/staff/sign-in.
2. Select **Sign in**.
3. On the Auth0 page, enter one of these accounts:

| Role | Email | Password |
| --- | --- | --- |
| Triage nurse | `judge-triage@recheck.demo` | `RDDkJLaWa8LEsq03PaLSAKn-` |
| Physician | `judge-physician@recheck.demo` | `nbGp1iHDz09swbzfprMnyWv5` |
| Charge nurse | `judge-charge@recheck.demo` | `bODgsx38CoZglmILYtYxLxVP` |

These are public demo accounts for the hackathon. All visits are synthetic. After the event, change the passwords or delete the accounts (Auth0 → User Management → Users).

## Set up the tenant

1. Create a tenant. Write down its domain, for example `recheck.ca.auth0.com`.
2. Go to **Applications → Create Application → Regular Web Application**. In **Settings**:
   - Allowed Callback URLs: `http://localhost:5173/api/staff/callback, https://<deployed-web-host>/api/staff/callback`
   - Allowed Logout URLs: `http://localhost:5173/staff/sign-in, https://<deployed-web-host>/staff/sign-in`
   - Copy the Domain, the Client ID and the Client Secret.
3. Go to **Authentication → Social**. Turn on Google and GitHub for the application. Give each one your own client ID and secret. The Auth0 developer keys are only for quick tests. Each provider sends people back to `https://<tenant-domain>/login/callback`.
   - **Google.** Go to Google Cloud Console → Google Auth Platform. Create the branding (External). Then create a **Web application** client with that redirect URI. While the app is in **Testing**, only listed test users can sign in. Add the Google email of each staff member under **Audience → Test users** and to `STAFF_ROLES`.
   - **GitHub.** Go to GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**. Use that callback URL. In Auth0, turn on the **Email address** attribute. If you do not, Auth0 gets no email for accounts with a private email. The GitHub primary email of a staff member must agree with their `STAFF_ROLES` entry.
4. Go to **Authentication → Database → Username-Password-Authentication**. Turn on **Disable Sign Ups**. Enable the connection for the application.
5. Go to **User Management → Users → Create User** in the database connection. Make one account for each judge role, for example `judge-triage@recheck.demo` and `judge-physician@recheck.demo`. Use long random passwords.
6. Go to **Actions → Library → Create Action** (Login / Post Login). Paste `post-login-action.js`. Add these secrets:
   - `RECHECK_CLIENT_ID`: the Client ID from step 2.
   - `STAFF_ROLES`: JSON that maps each email to a role. Include the SSO emails of the team and the judge accounts:

     ```json
     {"you@gmail.com": "charge_nurse", "judge-triage@recheck.demo": "triage_nurse", "judge-physician@recheck.demo": "physician"}
     ```

7. Deploy the Action. In **Actions → Triggers → post-login**, drag it into the flow and apply.
8. Put the settings in the root `.env` of the repository (see `api/README.md`):

   ```sh
   AUTH0_DOMAIN=recheck.ca.auth0.com
   AUTH0_CLIENT_ID=...
   AUTH0_CLIENT_SECRET=...
   ```

To add or remove a staff member, edit `STAFF_ROLES` and deploy the Action again. A role change starts at the next sign-in.

## Check it

1. Open `http://localhost:5173/api/staff/login?return_to=/staff/triage`. Sign in with a listed account. Make sure that you arrive at `/staff/triage`.
2. Make sure that `GET /api/staff/session` shows your Auth0 user ID, name and role.
3. Sign in with an account that is not on the list. Make sure that you arrive at `/staff/sign-in?error=access_denied`.
4. Open `/api/staff/logout`. Make sure that you arrive at the sign-in page and that the next sign-in asks for an account again.

`/api/staff/...` must be on the same origin as the web app, because the cookies are first-party. In development, Vite must send `/api` to FastAPI.
