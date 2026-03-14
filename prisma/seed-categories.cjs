/**
 * seed-categories.cjs
 * Tecrubelerim.com — Tüm ana kategoriler ve alt kategoriler
 * Çalıştır: node prisma/seed-categories.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SEO = { seoPattern: '/:sehir/:ilce/:slug' };

// [slug, name, parentSlug | null]
const CATEGORIES = [
  // ANA KATEGORİLER
  ['yeme-icme',          'Yeme & İçme',              null],
  ['saglik-medikal',     'Sağlık & Medikal',          null],
  ['guzellik-bakim',     'Güzellik & Bakım',          null],
  ['alisveris',          'Alışveriş',                 null],
  ['hizmetler',          'Hizmetler',                 null],
  ['egitim',             'Eğitim',                    null],
  ['eglence-kultur',     'Eğlence & Kültür',          null],
  ['konaklama',          'Konaklama',                 null],
  ['evcil-hayvan',       'Evcil Hayvan',              null],
  ['ulasim',             'Ulaşım & Araç',             null],

  // YEME & İÇME
  ['kafeler',            'Kafeler',                   'yeme-icme'],
  ['restoranlar',        'Restoranlar',               'yeme-icme'],
  ['barlar',             'Barlar & Gece Hayatı',      'yeme-icme'],
  ['pastane-firin',      'Pastane & Fırın',           'yeme-icme'],
  ['fast-food',          'Fast Food & Paket Servis',  'yeme-icme'],
  ['kahve-cay',          'Kahve & Çay',               'yeme-icme'],

  // SAĞLIK & MEDİKAL
  ['klinik-poliklinik',  'Klinik & Poliklinik',       'saglik-medikal'],
  ['eczane',             'Eczane',                    'saglik-medikal'],
  ['dis-sagligi',        'Diş Sağlığı',               'saglik-medikal'],
  ['spor-fitness',       'Spor & Fitness',            'saglik-medikal'],
  ['psikoloji-terapi',   'Psikoloji & Terapi',        'saglik-medikal'],
  ['hastane',            'Hastane & Acil',            'saglik-medikal'],

  // GÜZELLİK & BAKIM
  ['kuafor-berber',      'Kuaför & Berber',           'guzellik-bakim'],
  ['guzellik-merkezi',   'Güzellik Merkezi',          'guzellik-bakim'],
  ['spa-masaj',          'Spa & Masaj',               'guzellik-bakim'],
  ['dovme-piercing',     'Dövme & Piercing',          'guzellik-bakim'],
  ['tirnak-studio',      'Tırnak Stüdyo',             'guzellik-bakim'],

  // ALIŞVERİŞ
  ['market-supermarket', 'Market & Süpermarket',      'alisveris'],
  ['giyim-moda',         'Giyim & Moda',              'alisveris'],
  ['elektronik',         'Elektronik & Teknoloji',    'alisveris'],
  ['avm',                'AVM & Alışveriş Merkezi',   'alisveris'],
  ['kitap-kirtasiye',    'Kitap & Kırtasiye',         'alisveris'],
  ['ev-mobilya',         'Ev & Mobilya',              'alisveris'],

  // HİZMETLER
  ['tadilat-insaat',     'Tadilat & İnşaat',          'hizmetler'],
  ['temizlik',           'Temizlik Hizmetleri',       'hizmetler'],
  ['nakliyat',           'Nakliyat & Taşımacılık',    'hizmetler'],
  ['oto-servis',         'Oto Servis & Yedek Parça',  'hizmetler'],
  ['muhasebe-finans',    'Muhasebe & Finans',         'hizmetler'],
  ['hukuk',              'Hukuki Hizmetler',          'hizmetler'],

  // EĞİTİM
  ['okul',               'Okul & Lise',               'egitim'],
  ['universite',         'Üniversite',                'egitim'],
  ['kurs-dershane',      'Kurs & Dershane',           'egitim'],
  ['dil-okulu',          'Dil Okulu',                 'egitim'],
  ['muzik-sanat',        'Müzik & Sanat Kursları',    'egitim'],

  // EĞLENCE & KÜLTÜR
  ['sinema',             'Sinema',                    'eglence-kultur'],
  ['muzeler',            'Müze & Galeri',             'eglence-kultur'],
  ['parklar',            'Park & Doğa',               'eglence-kultur'],
  ['oyun-eglence',       'Oyun & Eğlence Merkezi',    'eglence-kultur'],
  ['dugun-organizasyon', 'Düğün & Organizasyon',      'eglence-kultur'],

  // KONAKLAMA
  ['otel',               'Otel',                      'konaklama'],
  ['pansiyon-hostel',    'Pansiyon & Hostel',         'konaklama'],
  ['apart-kiralik',      'Apart & Kiralık',           'konaklama'],

  // EVCİL HAYVAN
  ['veteriner',          'Veteriner',                 'evcil-hayvan'],
  ['pet-shop',           'Pet Shop',                  'evcil-hayvan'],
  ['hayvan-bakimevi',    'Hayvan Bakımevi',           'evcil-hayvan'],

  // ULAŞIM & ARAÇ
  ['oto-kiralama',       'Araç Kiralama',             'ulasim'],
  ['oto-galeri',         'Oto Galeri',                'ulasim'],
  ['taksi-servis',       'Taksi & Servis',            'ulasim'],
];

async function seed() {
  // Önce ana kategorileri yaz, parentId map'i oluştur
  const idMap = {}; // slug → id

  // Pass 1: Ana kategoriler (parentSlug === null)
  const anaKategoriler = CATEGORIES.filter(([, , p]) => p === null);
  for (const [slug, name] of anaKategoriler) {
    const cat = await prisma.category.upsert({
      where: { slug },
      update: { name, attributeSchema: SEO },
      create: {
        name,
        slug,
        description: null,
        icon: null,
        parentId: null,
        attributeSchema: SEO,
      },
    });
    idMap[slug] = cat.id;
  }

  // Pass 2: Alt kategoriler
  const altKategoriler = CATEGORIES.filter(([, , p]) => p !== null);
  for (const [slug, name, parentSlug] of altKategoriler) {
    const parentId = idMap[parentSlug];
    if (!parentId) {
      console.error(`HATA: parentSlug bulunamadı: ${parentSlug}`);
      continue;
    }
    const cat = await prisma.category.upsert({
      where: { slug },
      update: { name, parentId, attributeSchema: SEO },
      create: {
        name,
        slug,
        description: null,
        icon: null,
        parentId,
        attributeSchema: SEO,
      },
    });
    idMap[slug] = cat.id;
  }

  console.log(`✅ ${anaKategoriler.length} ana kategori, ${altKategoriler.length} alt kategori eklendi.`);
  console.log(`Toplam: ${CATEGORIES.length} kategori`);
}

seed()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
