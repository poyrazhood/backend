import slugifyLib from 'slugify';

/**
 * Türkçe karakterleri destekleyen slug üretici
 * @param {string} text
 * @returns {string}
 */
export function generateSlug(text) {
  return slugifyLib(text, {
    lower: true,
    strict: true,
    locale: 'tr',
    trim: true,
  });
}

/**
 * Benzersiz slug üretir — collision varsa sonuna numara ekler
 * @param {string} baseSlug
 * @param {(slug: string) => Promise<boolean>} checkExists
 * @returns {Promise<string>}
 */
export async function generateUniqueSlug(baseSlug, checkExists) {
  let slug = baseSlug;
  let counter = 1;

  while (await checkExists(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}
