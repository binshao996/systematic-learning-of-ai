import { deepseekChat } from "./client";

export async function structuredChat<T>(
  systemPrompt: string,
  userMessage: string
): Promise<T> {
  const res = await deepseekChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    { temperature: 0.1 }
  );

  const json = await res.json() as { choices: { message: { content: string } }[] };
  return JSON.parse(json.choices[0].message.content) as T;
}
