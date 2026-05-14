export async function calculator(args: { expression: string }): Promise<string> {
  try {
    // Safe evaluation: only allow numbers, operators, parens, and math functions
    const sanitized = args.expression.replace(/\s+/g, "");
    if (!/^[0-9+\-*/().%^, Math.sqrt Math.pow Math.abs Math.round Math.floor Math.ceil Math.sin Math.cos Math.tan Math.log Math.log10 Math.exp Math.PI Math.E]+$/.test(sanitized)) {
      return "Error: expression contains disallowed characters.";
    }

    const result = Function(`"use strict"; return (${args.expression})`)();
    return String(result);
  } catch (err) {
    return `Calculation error: ${err instanceof Error ? err.message : "Invalid expression"}`;
  }
}
