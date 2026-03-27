// tecrubelerim.com — Sözleşme & Yardım İçerikleri
// Kullanım: node site-content.cjs
// DB'ye yazar: SiteConfig tablosuna privacy_policy, terms_of_service, help

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const CONTENTS = {

privacy_policy: `Gizlilik Politikası
Son güncelleme: Mart 2026

tecrubelerim.com olarak kullanıcılarımızın gizliliğine önem veriyoruz. Bu politika, sitemizi kullanırken hangi verileri topladığımızı ve bu verileri nasıl kullandığımızı açıklamaktadır.

Topladığımız Veriler

Hesap bilgileri: Üye olduğunuzda ad, e-posta adresi ve şifre bilgilerinizi alıyoruz.

Kullanım verileri: Ziyaret ettiğiniz sayfalar, arama sorgularınız ve işletmelere verdiğiniz yorumlar kayıt altına alınır.

Teknik veriler: IP adresi, tarayıcı türü ve cihaz bilgisi gibi standart log verileri toplanır.

Verilerinizi Nasıl Kullanıyoruz

Topladığımız verileri yalnızca şu amaçlarla kullanıyoruz: hizmetin düzgün çalışması, kullanıcı deneyiminin iyileştirilmesi, spam ve sahte yorumların önlenmesi. Verilerinizi üçüncü taraflarla satmıyor veya paylaşmıyoruz.

Çerezler

Sitemiz oturum yönetimi ve tercihlerinizi hatırlamak için çerez kullanmaktadır. Tarayıcı ayarlarınızdan çerezleri devre dışı bırakabilirsiniz; ancak bu durumda bazı özellikler çalışmayabilir.

Verilerinize Erişim ve Silme

Hesabınızdaki kişisel verilerinizi görüntüleme, düzenleme veya silme hakkına sahipsiniz. Bu talepler için iletişim@tecrubelerim.com adresine yazabilirsiniz.

Değişiklikler

Bu politikayı zaman zaman güncelleyebiliriz. Önemli değişiklikler olduğunda sizi e-posta ile bilgilendiririz.

İletişim: iletisim@tecrubelerim.com`,

// ─────────────────────────────────────────────────────────────────────────────

terms_of_service: `Kullanım Koşulları
Son güncelleme: Mart 2026

tecrubelerim.com'u kullanarak aşağıdaki koşulları kabul etmiş sayılırsınız.

Genel Kurallar

tecrubelerim.com, Türkiye'deki yerel işletmeleri keşfetmenizi ve deneyimlerinizi paylaşmanızı sağlayan bir platformdur. Hizmeti kullanan her kullanıcı bu koşullara uymakla yükümlüdür.

Yorum ve İçerik Kuralları

Platforma yüklediğiniz yorum ve içerikler gerçek deneyimlerinize dayanmalıdır. Aşağıdaki içerikler kesinlikle yasaktır: sahte veya yanıltıcı yorumlar, hakaret ve küfür içeren ifadeler, kişisel bilgi paylaşımı, telif hakkı ihlali oluşturan materyaller, ticari amaçlı spam içerikler.

Hesap Sorumluluğu

Hesabınızın güvenliğinden siz sorumlusunuz. Başkası adına yorum yazmak, birden fazla hesap oluşturarak oy manipülasyonu yapmak yasaktır. Bu tür ihlaller hesabın kalıcı olarak kapatılmasına yol açar.

İşletme Sahipleri

İşletme sahipleri, sayfalarındaki yanıltıcı bilgileri düzeltmek için bizimle iletişime geçebilir. İşletme sayfalarına sahte olumlu yorum bırakmak veya rakiplere sahte olumsuz yorum yapmak yasaktır.

Sorumluluk Sınırı

tecrubelerim.com, kullanıcıların paylaştığı yorumların doğruluğundan sorumlu tutulamaz. Platform, işletme ziyaretinizden doğabilecek zararlar için sorumluluk kabul etmez.

Fikri Mülkiyet

Platforma yüklediğiniz içeriklerin telif hakkı size aittir; ancak bu içerikleri platformda yayınlamamız için bize lisans vermiş olursunuz.

Değişiklikler

Koşulları güncelleme hakkımız saklıdır. Değişiklikler yayınlandıktan sonra platformu kullanmaya devam etmeniz yeni koşulları kabul ettiğiniz anlamına gelir.

İletişim: iletisim@tecrubelerim.com`,

// ─────────────────────────────────────────────────────────────────────────────

help: `Yardım Merkezi

tecrubelerim.com Nedir?

tecrubelerim.com, Türkiye genelindeki restoranları, kafeleri, sağlık kuruluşlarını, güzellik salonlarını ve daha birçok yerel işletmeyi keşfetmenizi sağlayan bir rehber platformudur. Gerçek kullanıcı yorumları ve yapay zeka destekli bilgilerle doğru işletmeyi bulmanıza yardımcı oluruz.

Yorum Nasıl Yazarım?

Yorum yazmak için önce üye olmanız gerekir. Üye giriş yaptıktan sonra işletme sayfasına gidin ve yorum bölümünden deneyiminizi paylaşın. Yorumlarınız diğer kullanıcıların doğru kararlar vermesine yardımcı olur.

İşletmemi Nasıl Ekletirim?

İşletmenizi platformumuza ekletmek için iletisim@tecrubelerim.com adresine işletme adı, adresi ve kategorisiyle birlikte yazın. Ekibimiz en kısa sürede dönüş yapacaktır.

Yanlış Bilgiyi Nasıl Düzeltirim?

İşletme sayfasındaki yanlış bir bilgiyi fark ettiyseniz sayfa altındaki "Bilgi Düzelt" bağlantısını kullanabilir ya da bize e-posta gönderebilirsiniz.

Uygunsuz Yorum Bildirimi

Kurallara aykırı gördüğünüz yorumları bildirmek için yorumun yanındaki bayrak ikonuna tıklayın. Ekibimiz bildirimi inceleyerek gerekli işlemi yapar.

Şifremi Unuttum

Giriş ekranındaki "Şifremi Unuttum" bağlantısına tıklayın. Kayıtlı e-posta adresinize sıfırlama bağlantısı gönderilecektir.

Hesabımı Nasıl Silerim?

Hesap silme talebinizi iletisim@tecrubelerim.com adresine iletebilirsiniz. Talebiniz 7 iş günü içinde işleme alınır.

Bize Ulaşın

Her türlü soru ve öneriniz için: iletisim@tecrubelerim.com`

}

async function main() {
  console.log('İçerikler DB\'ye yazılıyor...\n')

  for (const [key, value] of Object.entries(CONTENTS)) {
    await prisma.siteConfig.upsert({
      where:  { key },
      update: { value },
      create: { key, value },
    })
    console.log(`✅ ${key} yazıldı`)
  }

  console.log('\nTamamlandı!')
  await prisma.$disconnect()
}

main().catch(async e => {
  console.error('Hata:', e.message)
  await prisma.$disconnect()
})
