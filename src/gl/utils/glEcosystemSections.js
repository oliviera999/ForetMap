/**
 * Découpe le contenu chapitre (biotope / biocénose) par écosystème catalogue
 * lorsque plusieurs biomes sont liés au chapitre.
 */

function normalizeMatchKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ');
}

function biomeMatchKeys(biome) {
  const keys = new Set();
  const slug = normalizeMatchKey(biome?.slug);
  const nom = normalizeMatchKey(biome?.nom);
  if (slug) keys.add(slug);
  if (nom) keys.add(nom);
  if (slug) keys.add(slug.replace(/\s+/g, '-'));
  if (nom) keys.add(nom.replace(/\s+/g, '-'));
  return keys;
}

function resolveBiomeForHeading(heading, biomes) {
  const key = normalizeMatchKey(heading);
  if (!key) return null;
  for (const biome of biomes) {
    const keys = biomeMatchKeys(biome);
    if (keys.has(key)) return biome.slug;
    for (const candidate of keys) {
      if (candidate.includes(key) || key.includes(candidate)) return biome.slug;
    }
  }
  return null;
}

/**
 * Répartit un markdown en sections `## Titre` selon les biomes du chapitre.
 * Le préambule (avant le premier titre) est rattaché au premier biome.
 * Les sections non reconnues sont fusionnées dans le premier biome.
 *
 * @returns {Map<string, string>} slug biome → markdown
 */
export function splitMarkdownByBiomes(markdown, biomes) {
  const text = String(markdown || '').trim();
  const map = new Map((biomes || []).map((b) => [String(b.slug), '']));
  if (!text || map.size === 0) return map;
  if (map.size === 1) {
    map.set(String(biomes[0].slug), text);
    return map;
  }

  const parts = text.split(/^##\s+(.+)\s*$/m);
  if (parts.length <= 1) {
    map.set(String(biomes[0].slug), text);
    return map;
  }

  const preamble = String(parts[0] || '').trim();
  if (preamble) {
    map.set(String(biomes[0].slug), preamble);
  }

  for (let i = 1; i < parts.length; i += 2) {
    const heading = String(parts[i] || '').trim();
    const body = String(parts[i + 1] || '').trim();
    const slug = resolveBiomeForHeading(heading, biomes) || String(biomes[0].slug);
    const previous = map.get(slug) || '';
    const chunk = body ? `${heading}\n\n${body}`.trim() : heading;
    map.set(slug, previous ? `${previous}\n\n${chunk}`.trim() : chunk);
  }

  return map;
}

/**
 * @param {Array<{ slug: string, nom?: string }>} biomes
 * @param {string} biotopeMarkdown
 * @param {string} biocenoseMarkdown
 */
export function buildEcosystemSections(biomes, biotopeMarkdown, biocenoseMarkdown) {
  const normalizedBiomes = (Array.isArray(biomes) ? biomes : [])
    .filter((b) => b && b.slug)
    .map((b) => ({ slug: String(b.slug), nom: String(b.nom || b.slug) }));

  if (normalizedBiomes.length === 0) {
    return [
      {
        slug: null,
        nom: 'Écosystème',
        biotopeMarkdown: String(biotopeMarkdown || '').trim(),
        biocenoseMarkdown: String(biocenoseMarkdown || '').trim(),
      },
    ];
  }

  const biotopeBySlug = splitMarkdownByBiomes(biotopeMarkdown, normalizedBiomes);
  const biocenoseBySlug = splitMarkdownByBiomes(biocenoseMarkdown, normalizedBiomes);

  return normalizedBiomes.map((biome) => ({
    slug: biome.slug,
    nom: biome.nom,
    biotopeMarkdown: biotopeBySlug.get(biome.slug) || '',
    biocenoseMarkdown: biocenoseBySlug.get(biome.slug) || '',
  }));
}
