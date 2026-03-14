/**
 * add-missing-jobs.cjs
 * Eksik kategorileri scraper queue DB'ye ekler.
 *
 * Kullanım:
 *   node scraper/add-missing-jobs.cjs          ← preview (kaç job eklenecek gösterir)
 *   node scraper/add-missing-jobs.cjs --commit  ← gerçekten ekle
 */

const Database = require('better-sqlite3');
const path = require('path');

const QUEUE_DB = path.join(__dirname, '..', 'memory', 'scraper-queue.db');

// ─── TÜRKİYE 81 İL & İLÇELER ─────────────────────────────────────────────────

const ILLER = [
  { il: 'Adana', ilceler: ['Aladağ','Ceyhan','Çukurova','Feke','İmamoğlu','Karaisalı','Karataş','Kozan','Pozantı','Saimbeyli','Sarıçam','Seyhan','Tufanbeyli','Yumurtalık','Yüreğir'] },
  { il: 'Adıyaman', ilceler: ['Adıyaman Merkez','Besni','Çelikhan','Gerger','Gölbaşı','Kahta','Samsat','Sincik','Tut'] },
  { il: 'Afyonkarahisar', ilceler: ['Afyon Merkez','Başmakçı','Bayat','Bolvadin','Çay','Çobanlar','Dazkırı','Dinar','Emirdağ','Evciler','Hocalar','İhsaniye','İscehisar','Kızılören','Sandıklı','Sinanpaşa','Sultandağı','Şuhut'] },
  { il: 'Ağrı', ilceler: ['Ağrı Merkez','Diyadin','Doğubayazıt','Eleşkirt','Hamur','Patnos','Taşlıçay','Tutak'] },
  { il: 'Aksaray', ilceler: ['Aksaray Merkez','Ağaçören','Eskil','Gülağaç','Güzelyurt','Ortaköy','Sarıyahşi','Sultanhanı'] },
  { il: 'Amasya', ilceler: ['Amasya Merkez','Göynücek','Gümüşhacıköy','Hamamözü','Merzifon','Suluova','Taşova'] },
  { il: 'Ankara', ilceler: ['Altındağ','Ayaş','Bala','Beypazarı','Çamlıdere','Çankaya','Çubuk','Elmadağ','Etimesgut','Evren','Gölbaşı','Güdül','Haymana','Kahramankazan','Kalecik','Keçiören','Kızılcahamam','Mamak','Nallıhan','Polatlı','Pursaklar','Sincan','Şereflikoçhisar','Yenimahalle'] },
  { il: 'Antalya', ilceler: ['Akseki','Aksu','Alanya','Demre','Döşemealtı','Elmalı','Finike','Gazipaşa','Gündoğmuş','İbradı','Kaş','Kemer','Kepez','Konyaaltı','Korkuteli','Kumluca','Manavgat','Muratpaşa','Serik'] },
  { il: 'Ardahan', ilceler: ['Ardahan Merkez','Çıldır','Damal','Göle','Hanak','Posof'] },
  { il: 'Artvin', ilceler: ['Ardanuç','Arhavi','Artvin Merkez','Borçka','Hopa','Murgul','Şavşat','Yusufeli'] },
  { il: 'Aydın', ilceler: ['Bozdoğan','Buharkent','Çine','Didim','Efeler','Germencik','İncirliova','Karacasu','Karpuzlu','Koçarlı','Köşk','Kuşadası','Kuyucak','Nazilli','Söke','Sultanhisar','Yenipazar'] },
  { il: 'Balıkesir', ilceler: ['Altıeylül','Ayvalık','Balya','Bandırma','Bigadiç','Burhaniye','Dursunbey','Edremit','Erdek','Gömeç','Gönen','Havran','İvrindi','Karesi','Kepsut','Manyas','Marmara','Savaştepe','Sındırgı','Susurluk'] },
  { il: 'Bartın', ilceler: ['Amasra','Bartın Merkez','Kurucaşile','Ulus'] },
  { il: 'Batman', ilceler: ['Beşiri','Gercüş','Hasankeyf','Batman Merkez','Kozluk','Sason'] },
  { il: 'Bayburt', ilceler: ['Aydıntepe','Bayburt Merkez','Demirözü'] },
  { il: 'Bilecik', ilceler: ['Bilecik Merkez','Bozüyük','Gölpazarı','İnhisar','Osmaneli','Pazaryeri','Söğüt','Yenipazar'] },
  { il: 'Bingöl', ilceler: ['Adaklı','Bingöl Merkez','Genç','Karlıova','Kiğı','Solhan','Yayladere','Yedisu'] },
  { il: 'Bitlis', ilceler: ['Adilcevaz','Ahlat','Bitlis Merkez','Güroymak','Hizan','Mutki','Tatvan'] },
  { il: 'Bolu', ilceler: ['Bolu Merkez','Dörtdivan','Gerede','Göynük','Kıbrıscık','Mengen','Mudurnu','Seben','Yeniçağa'] },
  { il: 'Burdur', ilceler: ['Ağlasun','Altınyayla','Bucak','Burdur Merkez','Çavdır','Çeltikçi','Gölhisar','Karamanlı','Kemer','Tefenni','Yeşilova'] },
  { il: 'Bursa', ilceler: ['Büyükorhan','Gemlik','Gürsu','Harmancık','İnegöl','İznik','Karacabey','Keles','Kestel','Mudanya','Mustafakemalpaşa','Nilüfer','Orhaneli','Orhangazi','Osmangazi','Yıldırım','Yenişehir'] },
  { il: 'Çanakkale', ilceler: ['Ayvacık','Bayramiç','Biga','Bozcaada','Çan','Çanakkale Merkez','Eceabat','Ezine','Gelibolu','Gökçeada','Lapseki','Yenice'] },
  { il: 'Çankırı', ilceler: ['Atkaracalar','Bayramören','Çankırı Merkez','Eldivan','Ilgaz','Korgun','Kurşunlu','Orta','Şabanözü','Yapraklı'] },
  { il: 'Çorum', ilceler: ['Alaca','Bayat','Boğazkale','Çorum Merkez','Dodurga','İskilip','Kargı','Laçin','Mecitözü','Oğuzlar','Ortaköy','Osmancık','Sungurlu','Uğurludağ'] },
  { il: 'Denizli', ilceler: ['Acıpayam','Babadağ','Baklan','Bekilli','Beyağaç','Bozkurt','Buldan','Çal','Çameli','Çardak','Çivril','Güney','Honaz','Kale','Merkezefendi','Pamukkale','Sarayköy','Serinhisar','Tavas'] },
  { il: 'Diyarbakır', ilceler: ['Bağlar','Bismil','Çermik','Çınar','Çüngüş','Dicle','Eğil','Ergani','Hani','Hazro','Kayapınar','Kocaköy','Kulp','Lice','Silvan','Sur','Yenişehir'] },
  { il: 'Düzce', ilceler: ['Akçakoca','Cumayeri','Çilimli','Düzce Merkez','Gölyaka','Gümüşova','Kaynaşlı','Yığılca'] },
  { il: 'Edirne', ilceler: ['Edirne Merkez','Enez','Havsa','İpsala','Keşan','Lalapaşa','Meriç','Süloğlu','Uzunköprü'] },
  { il: 'Elazığ', ilceler: ['Ağın','Alacakaya','Arıcak','Baskil','Elazığ Merkez','Karakoçan','Keban','Kovancılar','Maden','Palu','Sivrice'] },
  { il: 'Erzincan', ilceler: ['Çayırlı','Erzincan Merkez','İliç','Kemah','Kemaliye','Otlukbeli','Refahiye','Tercan','Üzümlü'] },
  { il: 'Erzurum', ilceler: ['Aşkale','Aziziye','Çat','Hınıs','Horasan','İspir','Karaçoban','Karayazı','Köprüköy','Narman','Oltu','Olur','Palandöken','Pasinler','Pazaryolu','Şenkaya','Tekman','Tortum','Uzundere','Yakutiye'] },
  { il: 'Eskişehir', ilceler: ['Alpu','Beylikova','Çifteler','Günyüzü','Han','İnönü','Mahmudiye','Mihalgazi','Mihalıççık','Odunpazarı','Sarıcakaya','Seyitgazi','Sivrihisar','Tepebaşı'] },
  { il: 'Gaziantep', ilceler: ['Araban','İslahiye','Karkamış','Nizip','Nurdağı','Oğuzeli','Şahinbey','Şehitkamil','Yavuzeli'] },
  { il: 'Giresun', ilceler: ['Alucra','Bulancak','Çamoluk','Çanakçı','Dereli','Doğankent','Espiye','Eynesil','Giresun Merkez','Görele','Güce','Keşap','Piraziz','Şebinkarahisar','Tirebolu','Yağlıdere'] },
  { il: 'Gümüşhane', ilceler: ['Gümüşhane Merkez','Kelkit','Köse','Kürtün','Şiran','Torul'] },
  { il: 'Hakkari', ilceler: ['Çukurca','Hakkari Merkez','Şemdinli','Yüksekova'] },
  { il: 'Hatay', ilceler: ['Altınözü','Antakya','Arsuz','Belen','Defne','Dörtyol','Erzin','Hassa','İskenderun','Kırıkhan','Kumlu','Payas','Reyhanlı','Samandağ','Yayladağı'] },
  { il: 'Iğdır', ilceler: ['Aralık','Iğdır Merkez','Karakoyunlu','Tuzluca'] },
  { il: 'Isparta', ilceler: ['Aksu','Atabey','Eğirdir','Gelendost','Gönen','Keçiborlu','Isparta Merkez','Senirkent','Sütçüler','Şarkikaraağaç','Uluborlu','Yalvaç','Yenişarbademli'] },
  { il: 'İstanbul', ilceler: ['Adalar','Arnavutköy','Ataşehir','Avcılar','Bağcılar','Bahçelievler','Bakırköy','Başakşehir','Bayrampaşa','Beşiktaş','Beykoz','Beylikdüzü','Beyoğlu','Büyükçekmece','Çatalca','Çekmeköy','Esenler','Esenyurt','Eyüpsultan','Fatih','Gaziosmanpaşa','Güngören','Kadıköy','Kağıthane','Kartal','Küçükçekmece','Maltepe','Pendik','Sancaktepe','Sarıyer','Silivri','Sultanbeyli','Sultangazi','Şile','Şişli','Tuzla','Ümraniye','Üsküdar','Zeytinburnu'] },
  { il: 'İzmir', ilceler: ['Aliağa','Balçova','Bayındır','Bayraklı','Bergama','Beydağ','Bornova','Buca','Çeşme','Çiğli','Dikili','Foça','Gaziemir','Güzelbahçe','Karabağlar','Karaburun','Karşıyaka','Kemalpaşa','Kınık','Kiraz','Konak','Menderes','Menemen','Narlıdere','Ödemiş','Seferihisar','Selçuk','Tire','Torbalı','Urla'] },
  { il: 'Kahramanmaraş', ilceler: ['Afşin','Andırın','Çağlayancerit','Dulkadiroğlu','Ekinözü','Elbistan','Göksun','Nurhak','Onikişubat','Pazarcık','Türkoğlu'] },
  { il: 'Karabük', ilceler: ['Eflani','Eskipazar','Karabük Merkez','Ovacık','Safranbolu','Yenice'] },
  { il: 'Karaman', ilceler: ['Ayrancı','Başyayla','Ermenek','Kazımkarabekir','Karaman Merkez','Sarıveliler'] },
  { il: 'Kars', ilceler: ['Akyaka','Arpaçay','Digor','Kağızman','Kars Merkez','Sarıkamış','Selim','Susuz'] },
  { il: 'Kastamonu', ilceler: ['Abana','Ağlı','Araç','Azdavay','Bozkurt','Cide','Çatalzeytin','Daday','Devrekani','Doğanyurt','Hanönü','İhsangazi','İnebolu','Kastamonu Merkez','Küre','Pınarbaşı','Seydiler','Şenpazar','Taşköprü','Tosya'] },
  { il: 'Kayseri', ilceler: ['Akkışla','Bünyan','Develi','Felahiye','Hacılar','İncesu','Kocasinan','Melikgazi','Özvatan','Pınarbaşı','Sarıoğlan','Sarız','Talas','Tomarza','Yahyalı','Yeşilhisar'] },
  { il: 'Kilis', ilceler: ['Elbeyli','Kilis Merkez','Musabeyli','Polateli'] },
  { il: 'Kırıkkale', ilceler: ['Bahşılı','Balışeyh','Çelebi','Delice','Karakeçili','Keskin','Kırıkkale Merkez','Sulakyurt','Yahşihan'] },
  { il: 'Kırklareli', ilceler: ['Babaeski','Demirköy','Kırklareli Merkez','Kofçaz','Lüleburgaz','Pehlivanköy','Pınarhisar','Vize'] },
  { il: 'Kırşehir', ilceler: ['Akçakent','Akpınar','Boztepe','Çiçekdağı','Kaman','Kırşehir Merkez','Mucur'] },
  { il: 'Kocaeli', ilceler: ['Başiskele','Çayırova','Darica','Derince','Dilovası','Gebze','Gölcük','İzmit','Kandıra','Karamürsel','Kartepe','Körfez'] },
  { il: 'Konya', ilceler: ['Ahırlı','Akören','Akşehir','Altınekin','Beyşehir','Bozkır','Cihanbeyli','Çeltik','Çumra','Derbent','Derebucak','Doğanhisar','Emirgazi','Ereğli','Güneysınır','Hadim','Halkapınar','Hüyük','Ilgın','Kadınhanı','Karapınar','Karatay','Kulu','Meram','Sarayönü','Selçuklu','Seydişehir','Taşkent','Tuzlukçu','Yalıhüyük','Yunak'] },
  { il: 'Kütahya', ilceler: ['Altıntaş','Aslanapa','Çavdarhisar','Domaniç','Dumlupınar','Emet','Gediz','Hisarcık','Kütahya Merkez','Pazarlar','Şaphane','Simav','Tavşanlı'] },
  { il: 'Malatya', ilceler: ['Akçadağ','Arapgir','Arguvan','Battalgazi','Darende','Doğanşehir','Doğanyol','Hekimhan','Kale','Kuluncak','Pütürge','Yazıhan','Yeşilyurt'] },
  { il: 'Manisa', ilceler: ['Ahmetli','Akhisar','Alaşehir','Demirci','Gölmarmara','Gördes','Kırkağaç','Köprübaşı','Kula','Salihli','Sarıgöl','Saruhanlı','Selendi','Soma','Şehzadeler','Turgutlu','Yunusemre'] },
  { il: 'Mardin', ilceler: ['Artuklu','Derik','Dargeçit','Kızıltepe','Mazıdağı','Midyat','Nusaybin','Ömerli','Savur','Yeşilli'] },
  { il: 'Mersin', ilceler: ['Akdeniz','Anamur','Aydıncık','Bozyazı','Çamlıyayla','Erdemli','Gülnar','Mezitli','Mut','Silifke','Tarsus','Toroslar','Yenişehir'] },
  { il: 'Muğla', ilceler: ['Bodrum','Dalaman','Datça','Fethiye','Kavaklıdere','Köyceğiz','Marmaris','Menteşe','Milas','Ortaca','Seydikemer','Ula','Yatağan'] },
  { il: 'Muş', ilceler: ['Bulanık','Hasköy','Korkut','Malazgirt','Muş Merkez','Varto'] },
  { il: 'Nevşehir', ilceler: ['Acıgöl','Avanos','Derinkuyu','Gülşehir','Hacıbektaş','Kozaklı','Nevşehir Merkez','Ürgüp'] },
  { il: 'Niğde', ilceler: ['Altunhisar','Bor','Çamardı','Çiftlik','Niğde Merkez','Ulukışla'] },
  { il: 'Ordu', ilceler: ['Akkuş','Altınordu','Aybastı','Çamaş','Çatalpınar','Çaybaşı','Fatsa','Gölköy','Gülyalı','Gürgentepe','İkizce','Kabadüz','Kabataş','Korgan','Kumru','Mesudiye','Perşembe','Ulubey','Ünye'] },
  { il: 'Osmaniye', ilceler: ['Bahçe','Düziçi','Hasanbeyli','Kadirli','Osmaniye Merkez','Sumbas','Toprakkale'] },
  { il: 'Rize', ilceler: ['Ardeşen','Çamlıhemşin','Çayeli','Derepazarı','Fındıklı','Güneysu','Hemşin','İkizdere','İyidere','Kalkandere','Pazar','Rize Merkez'] },
  { il: 'Sakarya', ilceler: ['Adapazarı','Akyazı','Arifiye','Erenler','Ferizli','Geyve','Hendek','Karapürçek','Karasu','Kaynarca','Kocaali','Pamukova','Sapanca','Serdivan','Söğütlü','Taraklı'] },
  { il: 'Samsun', ilceler: ['Alaçam','Asarcık','Atakum','Ayvacık','Bafra','Canik','Çarşamba','Havza','İlkadım','Kavak','Ladik','Ondokuzmayıs','Salıpazarı','Tekkeköy','Terme','Vezirköprü','Yakakent'] },
  { il: 'Siirt', ilceler: ['Baykan','Eruh','Kurtalan','Pervari','Siirt Merkez','Şirvan','Tillo'] },
  { il: 'Sinop', ilceler: ['Ayancık','Boyabat','Dikmen','Durağan','Erfelek','Gerze','Saraydüzü','Sinop Merkez','Türkeli'] },
  { il: 'Sivas', ilceler: ['Akıncılar','Altınyayla','Divriği','Doğanşar','Gemerek','Gölova','Gürün','Hafik','İmranlı','Kangal','Koyulhisar','Sivas Merkez','Suşehri','Şarkışla','Ulaş','Yıldızeli','Zara'] },
  { il: 'Şanlıurfa', ilceler: ['Akçakale','Birecik','Bozova','Ceylanpınar','Eyyübiye','Halfeti','Haliliye','Harran','Hilvan','Karaköprü','Siverek','Suruç','Viranşehir'] },
  { il: 'Şırnak', ilceler: ['Beytüşşebap','Cizre','Güçlükonak','İdil','Silopi','Şırnak Merkez','Uludere'] },
  { il: 'Tekirdağ', ilceler: ['Çerkezköy','Çorlu','Ergene','Hayrabolu','Kapaklı','Malkara','Marmaraereğlisi','Muratlı','Saray','Süleymanpaşa','Şarköy'] },
  { il: 'Tokat', ilceler: ['Almus','Artova','Başçiftlik','Erbaa','Niksar','Pazar','Reşadiye','Sulusaray','Tokat Merkez','Turhal','Yeşilyurt','Zile'] },
  { il: 'Trabzon', ilceler: ['Akçaabat','Araklı','Arsin','Beşikdüzü','Çarşıbaşı','Çaykara','Dernekpazarı','Düzköy','Hayrat','Köprübaşı','Maçka','Of','Ortahisar','Sürmene','Şalpazarı','Tonya','Vakfıkebir','Yomra'] },
  { il: 'Tunceli', ilceler: ['Çemişgezek','Hozat','Mazgirt','Nazımiye','Ovacık','Pertek','Pülümür','Tunceli Merkez'] },
  { il: 'Uşak', ilceler: ['Banaz','Eşme','Karahallı','Sivaslı','Ulubey','Uşak Merkez'] },
  { il: 'Van', ilceler: ['Bahçesaray','Başkale','Çaldıran','Çatak','Edremit','Erciş','Gevaş','Gürpınar','İpekyolu','Muradiye','Özalp','Saray','Tuşba'] },
  { il: 'Yalova', ilceler: ['Altınova','Armutlu','Çınarcık','Çiftlikköy','Termal','Yalova Merkez'] },
  { il: 'Yozgat', ilceler: ['Akdağmadeni','Aydıncık','Boğazlıyan','Çandır','Çayıralan','Çekerek','Kadışehri','Saraykent','Sarıkaya','Sorgun','Şefaatli','Yenifakılı','Yerköy','Yozgat Merkez'] },
  { il: 'Zonguldak', ilceler: ['Alaplı','Çaycuma','Devrek','Ereğli','Gökçebey','Kilimli','Kozlu','Zonguldak Merkez'] },
];

// ─── KATEGORİ → ARAMA TERİMLERİ ──────────────────────────────────────────────
// Key = Prisma'daki category.slug ile AYNI olmalı

const KATEGORI_ARAMALAR = {
  'yeme-icme': [
    'Kafeler',
    'Restoranlar',
    'Barlar & Gece Hayatı',
    'Fast Food & Paket Servis',
    'Pastane & Fırın',
    'Kahvaltı Salonu',
    'Kahve & Çay Evi',
  ],
  'saglik-medikal': [
    'Hastane',
    'Eczane',
    'Klinik & Poliklinik',
    'Diş Hekimi',
    'Spor & Fitness',
    'Psikolog & Psikiyatrist',
    'Göz Doktoru & Optik',
    'Fizyoterapi',
  ],
  'guzellik-bakim': [
    'Kuaför & Berber',
    'Güzellik Merkezi',
    'Spa & Masaj',
    'Dövme Stüdyosu',
    'Tırnak Bakımı',
    'Epilasyon & Güzellik',
  ],
  'alisveris': [
    'Market & Süpermarket',
    'Alışveriş Merkezi',
    'Elektronik Mağaza',
    'Giyim Mağazası',
    'Kitabevi & Kırtasiye',
    'Mobilya Mağazası',
    'Çiçekçi',
    'Spor Malzemeleri',
  ],
  'hizmetler': [
    'Avukat & Hukuk Bürosu',
    'Mali Müşavir & Muhasebe',
    'Nakliyat',
    'Oto Servis & Tamirci',
    'Temizlik Şirketi',
    'Tadilat & Boya',
    'Fotoğrafçı',
    'Sigorta Acentesi',
    'Emlak Ofisi',
    'Noter',
  ],
  'egitim': [
    'Dershane & Etüt Merkezi',
    'Dil Okulu',
    'Müzik Kursu',
    'Sürücü Kursu',
    'Bilgisayar Kursu',
    'Anaokulu & Kreş',
  ],
  'eglence-kultur': [
    'Sinema',
    'Müze & Sanat Galerisi',
    'Oyun Merkezi',
    'Düğün & Organizasyon Salonu',
    'Bowling & Bilardo',
    'Escape Room',
  ],
  'konaklama': [
    'Otel',
    'Pansiyon & Hostel',
    'Apart Otel',
  ],
  'evcil-hayvan': [
    'Veteriner',
    'Pet Shop',
    'Hayvan Bakımevi',
  ],
  'ulasim-arac': [
    'Oto Galeri',
    'Araç Kiralama',
    'Oto Yıkama',
    'Lastikçi',
    'Oto Ekspertiz',
  ],
};

// ─── YARDIMCILAR ─────────────────────────────────────────────────────────────

function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-')
    .replace(/-+/g,'-').replace(/^-|-$/g,'');
}

// ─── ANA FONKSİYON ───────────────────────────────────────────────────────────

function main() {
  const commit = process.argv.includes('--commit');

  const qdb = new Database(QUEUE_DB);

  // Gerçek sütun isimlerini göster (debug)
  const cols = qdb.prepare("PRAGMA table_info(jobs)").all().map(r => r.name);
  console.log('📋 Tablo sütunları:', cols.join(', '));

  // Mevcut tüm sorguları al (duplicate kontrolü)
  const existing = new Set();
  qdb.prepare("SELECT il_slug, ilce_slug, query FROM jobs").all().forEach(r => {
    existing.add(`${r.il_slug}|${r.ilce_slug}|${(r.query||'').toLowerCase().trim()}`);
  });
  console.log(`📦 Mevcut job sayısı: ${existing.size}`);

  // Sadece tabloda GERÇEKTEN olan sütunlara insert yap
  const colSet = new Set(cols);
  const insertCols = ['il','ilce','il_slug','ilce_slug','query','kategori','status','priority'].filter(c => colSet.has(c));
  const placeholders = insertCols.map(() => '?').join(', ');
  const insertStmt = qdb.prepare(
    `INSERT OR IGNORE INTO jobs (${insertCols.join(', ')}) VALUES (${placeholders})`
  );

  const insertMany = qdb.transaction((rows) => {
    for (const r of rows) {
      const values = insertCols.map(c => {
        if (c === 'status') return 'pending';
        if (c === 'priority') return 0;
        return r[c];
      });
      insertStmt.run(...values);
    }
  });

  let totalNew = 0;
  let totalSkipped = 0;
  const toInsert = [];
  const preview = [];

  for (const { il, ilceler } of ILLER) {
    const il_slug = toSlug(il);
    for (const ilce of ilceler) {
      const ilce_slug = toSlug(ilce);
      for (const [kategori, aramalar] of Object.entries(KATEGORI_ARAMALAR)) {
        for (const arama of aramalar) {
          const query = `${il} ${ilce} ${arama}`;
          const key = `${il_slug}|${ilce_slug}|${query.toLowerCase().trim()}`;

          if (existing.has(key)) {
            totalSkipped++;
            continue;
          }

          totalNew++;
          toInsert.push({ il, ilce, il_slug, ilce_slug, query, kategori });
          if (preview.length < 20) preview.push(`  [${il}] ${query} → ${kategori}`);
        }
      }
    }
  }

  const totalKategori = Object.values(KATEGORI_ARAMALAR).reduce((s, v) => s + v.length, 0);
  const totalIlce = ILLER.reduce((s, x) => s + x.ilceler.length, 0);

  console.log(`\n📊 ÖZET`);
  console.log(`   İl sayısı         : ${ILLER.length}`);
  console.log(`   İlçe sayısı       : ${totalIlce}`);
  console.log(`   Arama terimi      : ${totalKategori}`);
  console.log(`   Teorik max        : ${totalIlce * totalKategori}`);
  console.log(`   Zaten mevcut      : ${totalSkipped}`);
  console.log(`   Eklenecek yeni    : ${totalNew}`);
  console.log(`   Toplam (sonra)    : ${existing.size + totalNew}`);

  if (!commit) {
    console.log(`\n👀 İlk 20 yeni job (önizleme):`);
    preview.forEach(l => console.log(l));
    console.log(`\n⚠️  DRY RUN — Gerçekten eklemek için:`);
    console.log(`   node scraper/add-missing-jobs.cjs --commit\n`);
    qdb.close();
    return;
  }

  console.log(`\n💾 ${totalNew} job ekleniyor...`);
  insertMany(toInsert);
  console.log(`✅ Tamamlandı! ${totalNew} yeni job queue'ya eklendi.\n`);

  qdb.close();
}

main();
