/**
 * slugify — converte texto em slug URL-safe.
 * "Marmitas da Maria!" → "marmitas-da-maria"
 * Sempre devolve algo (fallback "negocio" se input estiver vazio).
 */
export function slugify(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "negocio";
}

/**
 * Garante unicidade do slug. Recebe `isTaken(s)` async e tenta `base`,
 * `base-2`, `base-3`, ... até no máximo 50 tentativas.
 */
export async function uniqueSlug(
  base: string,
  isTaken: (s: string) => Promise<boolean>,
): Promise<string> {
  const seed = slugify(base);
  let candidate = seed;
  let i = 1;
  while (await isTaken(candidate)) {
    i += 1;
    candidate = `${seed}-${i}`.slice(0, 40);
    if (i > 50) {
      candidate = `${seed.slice(0, 30)}-${Math.random().toString(36).slice(2, 8)}`;
      break;
    }
  }
  return candidate;
}
