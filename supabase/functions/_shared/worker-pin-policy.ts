export function canResetWorkerPin(roles: string[], callerVenue: string | null, targetVenue: string | null): boolean {
  return roles.includes("admin") && !!callerVenue && callerVenue === targetVenue;
}