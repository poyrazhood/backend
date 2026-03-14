import Link from 'next/link';
import { Search } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-secondary mb-6">
            Güvendiğin İşletmeyi Keşfet
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Gerçek kullanıcı deneyimleri ile doğru kararlar verin
          </p>
          
          {/* Search Bar */}
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <input
                type="text"
                placeholder="İşletme ara..."
                className="w-full px-6 py-4 pr-12 rounded-full border-2 border-gray-200 focus:border-primary focus:outline-none shadow-lg text-lg"
              />
              <button className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-white p-3 rounded-full hover:bg-primary-600 transition">
                <Search size={24} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Businesses */}
      <section className="py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold mb-8">Öne Çıkan İşletmeler</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((item) => (
              <Link
                key={item}
                href={`/isletmeler/ornek-isletme-${item}`}
                className="bg-white rounded-lg p-6 shadow-md card-hover cursor-pointer block"
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="font-bold text-lg">İşletme Adı {item}</h3>
                  <span className="badge badge-verified text-xs">Doğrulanmış</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="star-rating">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <div key={star} className="star-square"></div>
                    ))}
                  </div>
                  <span className="font-semibold text-primary">4.9</span>
                </div>
                <p className="text-sm text-gray-600">1,234 değerlendirme</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold mb-8">Kategoriler</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {['Banka', 'Restoran', 'Teknoloji', 'Sağlık', 'Eğitim', 'Alışveriş'].map((category) => (
              <div
                key={category}
                className="bg-background p-6 rounded-lg text-center cursor-pointer hover:scale-105 transition-transform"
              >
                <div className="w-16 h-16 bg-primary-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                  <span className="text-2xl">🏢</span>
                </div>
                <p className="font-semibold">{category}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-secondary text-white py-12 px-4">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-bold text-lg mb-4">Tecrubelerim</h3>
            <p className="text-gray-400 text-sm">
              Türkiye'nin güvenilir işletme değerlendirme platformu
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Kurumsal</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href="#" className="hover:text-primary">Hakkımızda</a></li>
              <li><a href="#" className="hover:text-primary">İletişim</a></li>
              <li><a href="#" className="hover:text-primary">Kariyer</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Yasal</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href="#" className="hover:text-primary">KVKK</a></li>
              <li><a href="#" className="hover:text-primary">Kullanım Koşulları</a></li>
              <li><a href="#" className="hover:text-primary">Gizlilik Politikası</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Sosyal Medya</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href="#" className="hover:text-primary">Twitter</a></li>
              <li><a href="#" className="hover:text-primary">Instagram</a></li>
              <li><a href="#" className="hover:text-primary">LinkedIn</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-8 pt-8 border-t border-gray-700 text-center text-sm text-gray-400">
          <p>&copy; 2024 Tecrubelerim. Tüm hakları saklıdır.</p>
        </div>
      </footer>
    </main>
  );
}
