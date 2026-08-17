// Binder's transactional mail, generated rather than hand-maintained four times.
//
//   node scripts/build-email-templates.mjs           writes supabase/templates/*.html
//   node scripts/build-email-templates.mjs --check   fails if they are stale
//
// Mail clients are a hostile rendering target: no external stylesheets, no web
// fonts, Outlook ignores half of CSS. So this is table-based, inline-styled,
// and the logo is a hosted PNG rather than an SVG. Everything a client might
// strip (background colour, rounded corners) is decoration; the button and the
// plain link below it survive on their own.
import { readFileSync, writeFileSync } from 'node:fs';

const check = process.argv.includes('--check');
const dir = 'supabase/templates';
const logo = 'https://beko2210.github.io/Binder/assets/binder-icon.png';
const site = 'https://beko2210.github.io/Binder/';

const BG = '#090A0F';
const SURFACE = '#12141B';
const LINE = '#2A2F3A';
const TEXT = '#F7F8F3';
const MUTED = '#9EA4B0';
const LIME = '#C7FF4A';

const mails = [
  {
    file: 'confirm-signup.html',
    preheader: 'Confirm your email address and your Binder account is ready.',
    eyebrow: 'One tap left',
    headline: 'Confirm your email address',
    body: 'You created a Binder account. Confirm this address and you can sign in — nobody can see or message you before you finish your profile.',
    action: 'Confirm my email',
    note: 'If you did not create a Binder account, ignore this mail. Nothing was created that anyone can see.',
  },
  {
    file: 'magic-link.html',
    preheader: 'Your Binder sign-in link.',
    eyebrow: 'Sign in',
    headline: 'Your sign-in link',
    body: 'Open this link on the phone you use Binder on. It works once and expires shortly.',
    action: 'Sign in to Binder',
    note: 'If you did not ask to sign in, ignore this mail and nothing happens.',
  },
  {
    file: 'recovery.html',
    preheader: 'Set a new Binder password.',
    eyebrow: 'Password',
    headline: 'Set a new password',
    body: 'Open this link on the phone you use Binder on, then choose a new password. The link works once and expires shortly.',
    action: 'Choose a new password',
    note: 'If you did not ask for this, ignore the mail. Your current password keeps working.',
  },
  {
    file: 'email-change.html',
    preheader: 'Confirm your new Binder email address.',
    eyebrow: 'Account',
    headline: 'Confirm your new address',
    body: 'You asked to change the email address on your Binder account. Confirm the new address to finish the change.',
    action: 'Confirm the change',
    note: 'If you did not ask for this, ignore the mail and tell us at nullmesh@protonmail.com — the change will not happen.',
  },
];

const render = (mail) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${mail.headline} — Binder</title>
</head>
<body style="margin:0;padding:0;background:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${mail.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:${SURFACE};border:1px solid ${LINE};border-radius:22px;">
      <tr><td style="padding:34px 34px 0 34px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding-right:12px;"><img src="${logo}" width="42" height="42" alt="" style="display:block;width:42px;height:42px;border-radius:12px;"></td>
          <td style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:800;letter-spacing:.22em;color:${TEXT};">BINDER</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:30px 34px 0 34px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${LIME};">${mail.eyebrow}</td></tr>
      <tr><td style="padding:10px 34px 0 34px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:27px;line-height:1.15;font-weight:800;letter-spacing:-.02em;color:${TEXT};">${mail.headline}</td></tr>
      <tr><td style="padding:14px 34px 0 34px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${MUTED};">${mail.body}</td></tr>
      <tr><td style="padding:26px 34px 0 34px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background:${LIME};border-radius:14px;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:15px 26px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;color:#10120D;text-decoration:none;">${mail.action}</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:20px 34px 0 34px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">Button not working? Copy this link into your browser:<br><a href="{{ .ConfirmationURL }}" style="color:${LIME};word-break:break-all;">{{ .ConfirmationURL }}</a></td></tr>
      <tr><td style="padding:24px 34px 0 34px;"><div style="height:1px;background:${LINE};line-height:1px;">&nbsp;</div></td></tr>
      <tr><td style="padding:18px 34px 30px 34px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#737985;">${mail.note}</td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
      <tr><td align="center" style="padding:18px 12px 0 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:#6B717C;">
        Binder · free dating without games · <a href="${site}" style="color:#8D939E;">${site.replace('https://', '').replace(/\/$/, '')}</a><br>
        This is a one-off mail about your account, not a newsletter.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;

const stale = [];
for (const mail of mails) {
  const path = `${dir}/${mail.file}`;
  const html = render(mail);
  if (check) {
    let current = '';
    try { current = readFileSync(path, 'utf8'); } catch { current = ''; }
    if (current !== html) stale.push(path);
  } else {
    writeFileSync(path, html);
  }
}

if (check) {
  if (stale.length) {
    console.error(`Stale email templates: ${stale.join(', ')}. Run \`npm run mail:templates\`.`);
    process.exit(1);
  }
  console.log(`Email templates match the generator (${mails.length}).`);
} else {
  console.log(`Wrote ${mails.length} email templates to ${dir}/`);
}
