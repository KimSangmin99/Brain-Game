const key = "brain-account-notice";
export function writeAccountNotice(message: string) {
  try {
    sessionStorage.setItem(key, message);
  } catch {
    /* A notice is optional; session revocation is already committed. */
  }
}
export function takeAccountNotice() {
  try {
    const value = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
}
