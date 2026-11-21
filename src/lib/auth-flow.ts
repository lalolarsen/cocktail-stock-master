// A bounded wait keeps an offline POS from being stuck on "Verificando" forever.
export async function withAuthTimeout<T>(operation: PromiseLike<T>, milliseconds = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("La conexión está tardando demasiado. Revisa internet e intenta nuevamente.")), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function isInvalidCredentials(error: { code?: string; message?: string }): boolean {
  return error.code === "invalid_credentials" ||
    (error.message ?? "").toLowerCase().includes("invalid login credentials");
}

export function isSameUserSessionEvent(event: string, verifiedUserId: string | null, incomingUserId: string | undefined): boolean {
  return (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
    !!verifiedUserId && verifiedUserId === incomingUserId;
}