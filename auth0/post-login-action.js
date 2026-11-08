/**
 * Recheck staff sign-in: Auth0 Post-Login Action.
 *
 * Paste this into Auth0 (Actions → Library → Create Action → Login / Post Login),
 * deploy it and add it to the Post Login trigger. See auth0/README.md.
 *
 * It lets in only accounts on the staff list and puts each account's one role
 * in the ID token. The Recheck API refuses an ID token without exactly one role.
 *
 * Action secrets:
 *   RECHECK_CLIENT_ID  the Recheck application's client ID (the Action skips other apps)
 *   STAFF_ROLES        JSON map of email to role, for example
 *                      {"nurse@example.com": "triage_nurse", "judge-physician@recheck.demo": "physician"}
 *
 * Roles: triage_nurse, physician, charge_nurse, quality.
 */
const ROLES_CLAIM = 'https://recheck/roles';
const ROLES = ['triage_nurse', 'physician', 'charge_nurse', 'quality'];

exports.onExecutePostLogin = async (event, api) => {
  if (event.client.client_id !== event.secrets.RECHECK_CLIENT_ID) return;

  const staffRoles = new Map();
  try {
    for (const [listed, role] of Object.entries(JSON.parse(event.secrets.STAFF_ROLES || '{}'))) {
      staffRoles.set(listed.trim().toLowerCase(), role);
    }
  } catch {
    api.access.deny('The Recheck staff list is misconfigured.');
    return;
  }

  const email = (event.user.email || '').trim().toLowerCase();
  // Demo password accounts are made by an admin with sign-up turned off.
  // SSO accounts must prove they own the email.
  const passwordAccount = event.connection.strategy === 'auth0';
  if (!email || (!passwordAccount && event.user.email_verified !== true)) {
    api.access.deny('Recheck needs a verified email address.');
    return;
  }

  const role = staffRoles.get(email);
  if (!ROLES.includes(role)) {
    api.access.deny('This account is not on the Recheck staff list.');
    return;
  }
  api.idToken.setCustomClaim(ROLES_CLAIM, [role]);
};
