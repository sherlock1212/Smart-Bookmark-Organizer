import { SourceParseError, type BraveProfile } from "../bookmarks/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

/**
 * Estrae l'elenco dei profili dal file "Local State" di Brave.
 * I profili sono le chiavi di profile.info_cache.
 */
export function parseLocalState(text: string): BraveProfile[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SourceParseError(
      "Il file 'Local State' di Brave non è leggibile (JSON non valido).",
    );
  }

  const profile = isRecord(data) ? data["profile"] : undefined;
  const infoCache = isRecord(profile) ? profile["info_cache"] : undefined;
  if (!isRecord(infoCache)) {
    throw new SourceParseError(
      "Nel file 'Local State' non ho trovato l'elenco dei profili di Brave.",
    );
  }

  const profiles: BraveProfile[] = Object.entries(infoCache)
    .filter(([, info]) => isRecord(info))
    .map(([dirName, info]) => {
      const record = info as Record<string, unknown>;
      const name = record["name"];
      const email = record["user_name"];
      return {
        dirName,
        displayName:
          typeof name === "string" && name.trim() !== "" ? name : dirName,
        email: typeof email === "string" && email !== "" ? email : null,
      };
    });

  if (profiles.length === 0) {
    throw new SourceParseError("Non risulta nessun profilo in Brave.");
  }

  // Ordine mostrato da Brave se disponibile, altrimenti ordine naturale.
  const order = isRecord(profile) ? profile["profiles_order"] : undefined;
  const orderList = Array.isArray(order)
    ? order.filter((v): v is string => typeof v === "string")
    : [];
  const rank = (dir: string): number => {
    const index = orderList.indexOf(dir);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return profiles.sort(
    (a, b) => rank(a.dirName) - rank(b.dirName) || naturalCompare(a.dirName, b.dirName),
  );
}
