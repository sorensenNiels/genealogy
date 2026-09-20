/** Shared by the tRPC client and the auth client, so the two can never drift. */
export const apiUrl: string = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
