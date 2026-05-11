const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const apiClient = {
  get: (path: string) => fetch(`${BASE_URL}/api${path}`).then((r) => r.json()),
  post: (path: string, body: unknown) =>
    fetch(`${BASE_URL}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  patch: (path: string, body: unknown) =>
    fetch(`${BASE_URL}/api${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  delete: (path: string) =>
    fetch(`${BASE_URL}/api${path}`, { method: "DELETE" }),
};
