// Pure validation for the sign-in / sign-up form. No React, no Supabase — the
// rules are worth testing on their own, and the screen only renders them.

export const MIN_PASSWORD_LENGTH = 8;

export type AuthMode = 'signin' | 'signup' | 'reset';

export type AuthFieldErrors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
};

// Deliberately permissive: the server is the authority on what an address is.
// This only catches the typo the user can see for themselves.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAuthForm(mode: AuthMode, email: string, password: string, confirmPassword: string): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  const trimmedEmail = email.trim();

  if (!trimmedEmail) errors.email = 'Enter your email address.';
  else if (!EMAIL_SHAPE.test(trimmedEmail)) errors.email = 'That does not look like an email address.';

  // A reset only needs somewhere to send the link; asking for the password the
  // person has just forgotten would be absurd.
  if (mode === 'reset') return errors;

  if (!password) errors.password = 'Enter your password.';
  else if (password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;

  if (mode === 'signup') {
    if (!confirmPassword) errors.confirmPassword = 'Repeat your password.';
    else if (confirmPassword !== password) errors.confirmPassword = 'The two passwords do not match.';
  }

  return errors;
}

export function hasAuthErrors(errors: AuthFieldErrors): boolean {
  return Boolean(errors.email || errors.password || errors.confirmPassword);
}
