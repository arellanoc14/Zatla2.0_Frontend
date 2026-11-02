// ZATLA has no accounts any more, so nobody is signed in and nobody is an admin.
// Kept so the code that asks (the studio's full toolbar) keeps working unchanged:
// same contract as before (null while checking, then true/false), and with no
// sign-in there is nothing to check, so the answer is always false.
export function useIsAdmin() {
  return false;
}
