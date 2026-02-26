export const ok = <T>(data: T) => ({ ok: true as const, data });

export const fail = (code: string, message: string, details?: Record<string, unknown>) => {
  const error = details ? { code, message, ...details } : { code, message };
  return {
    ok: false as const,
    error
  };
};
