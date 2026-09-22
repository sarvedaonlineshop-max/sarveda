/** Store + Tasks admins always provisioned (in addition to ADMIN_BOOTSTRAP_EMAILS). */
export const CANONICAL_STORE_ADMINS: ReadonlyArray<{
  email: string;
  name: string;
  resetPassword?: boolean;
}> = [
  { email: "sowmya@sarveda.com", name: "Sowmya" },
  { email: "accounts@sarveda.com", name: "Accounts" },
  { email: "prem@sarveda.com", name: "Prem", resetPassword: true }
];
