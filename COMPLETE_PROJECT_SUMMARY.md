# TECRUBELERIM.COM - KAPSAMLI PROJE ÖZETİ (A'dan Z'ye)

**Son Güncelleme:** 2024-02-24
**Durum:** ✅ Backend Trust Sistemi Tamamlandı | ✅ Frontend Temel Yapı Tamamlandı | ⏳ Live Search Bekliyor

---

## 📋 İÇİNDEKİLER
1. [Backend Implementasyonu](#backend-implementasyonu)
2. [Frontend Implementasyonu](#frontend-implementasyonu)
3. [Dosya Yapısı](#dosya-yapısı)
4. [API Endpoints](#api-endpoints)
5. [Özellikler](#özellikler)
6. [Kurulum ve Çalıştırma](#kurulum-ve-çalıştırma)

---

## 🔧 BACKEND IMPLEMENTASYONU

### 1. Trust Score Sistemi (`src/services/userService.js`)

**Amaç:** Kullanıcıların güvenilirlik puanını ve rozet seviyelerini yönetmek.

#### A. `updateTrustScore()` Fonksiyonu
**Ne Yapar:**
- Kullanıcının güven puanını günceller (0-100 arası)
- Farklı aksiyonlara göre puan verir/alır
- Trust score geçmişini kaydeder

**Puan Sistemi:**
```javascript
'review_published'  → +5 puan   // Yorum yayınlandığında
'helpful_vote'      → +2 puan   // Yararlı oy aldığında
'verified'          → +10 puan  // Hesap doğrulandığında
'review_removed'    → -3 puan   // Yorum kaldırıldığında
'spam_detected'     → -10 puan  // Spam tespit edildiğinde
```

**Trust Level Hesaplama:**
```javascript
86-100 puan → VERIFIED (Doğrulanmış)
71-85 puan  → HIGHLY_TRUSTED (Çok Güvenilir)
51-70 puan  → TRUSTED (Güvenilir)
31-50 puan  → DEVELOPING (Gelişiyor)
0-30 puan   → NEWCOMER (Yeni)
```

#### B. `calculateBadgeLevel()` Fonksiyonu
**Ne Yapar:**
- Kullanıcının rozet seviyesini hesaplar
- Yorum sayısı ve yararlı oy yüzdesine göre rozet verir

**Rozet Sistemi:**
```javascript
BRONZE   → 5+ yorum
SILVER   → 20+ yorum + %80+ yararlı oy
GOLD     → 50+ yorum + %90+ yararlı oy + Doğrulanmış hesap
PLATINUM → 500+ yorum (Moderatör adayı)
```

**Hesaplama Mantığı:**
```javascript
helpfulPercentage = (helpfulVotes / totalReviews) * 100
isVerified = emailVerified || phoneVerified
```

#### C. `getUserProfile()` Fonksiyonu
**Ne Yapar:**
- Kullanıcının tam profil bilgilerini döner
- Trust score, badge level, istatistikler dahil

**Dönen Veriler:**
```javascript
{
  id, username, email, fullName, avatarUrl,
  trustScore, trustLevel, badgeLevel,
  totalReviews, helpfulVotes, verifiedReviews,
  emailVerified, phoneVerified,
  profileViews, followersCount, followingCount,
  stats: {
    helpfulPercentage,
    isVerified
  }
}
```

---

### 2. Review Routes Güncellemeleri (`src/routes/reviewRoutes.js`)

#### A. POST `/reviews` Endpoint
**Değişiklikler:**
```javascript
// Yorum oluşturulduğunda
if (isPublished) {
  // Trust score güncelle
  await updateTrustScore(userId, 'review_published', {
    reviewId: review.id,
    businessId
  });
  
  // Badge seviyesini yeniden hesapla
  await calculateBadgeLevel(userId);
}
```

**Özellikler:**
- ✅ Sadece yayınlanan yorumlar için trust score günceller
- ✅ Karantinaya alınan yorumlar için güncelleme yapmaz
- ✅ Fraud detection entegrasyonu
- ✅ Hata durumunda graceful degradation

#### B. POST `/reviews/:reviewId/helpful` Endpoint
**Yeni Özellikler:**
```javascript
// Yararlı işareti eklendiğinde
if (!review.isPublished) {
  return error('Yayınlanmamış yoruma yararlı işareti eklenemez');
}

// Yorum yazarına +2 puan ver
await updateTrustScore(review.userId, 'helpful_vote', {
  reviewId: review.id,
  votedBy: request.user.userId
});

// Badge seviyesini güncelle
await calculateBadgeLevel(review.userId);
```

**Validasyon:**
- ✅ Sadece yayınlanmış yorumlar için yararlı işareti
- ✅ Yorum yazarının trust score'u güncellenir
- ✅ Badge seviyesi otomatik yeniden hesaplanır

---

### 3. Auth Routes Güncellemeleri (`src/routes/authRoutes.js`)

#### Yeni Endpoint: GET `/auth/me`
**Amaç:** Giriş yapmış kullanıcının profil bilgilerini döner

**Implementasyon:**
```javascript
fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
  const userProfile = await getUserProfile(request.user.userId);
  return reply.code(200).send({ 
    message: 'User profile retrieved successfully', 
    user: userProfile 
  });
});
```

**Dönen Veri:**
```json
{
  "message": "User profile retrieved successfully",
  "user": {
    "id": "uuid",
    "username": "kullanici1",
    "trustScore": 85,
    "trustLevel": "HIGHLY_TRUSTED",
    "badgeLevel": "GOLD",
    "totalReviews": 52,
    "helpfulVotes": 47,
    "stats": {
      "helpfulPercentage": "90.38",
      "isVerified": true
    }
  }
}
```

---

## 🎨 FRONTEND IMPLEMENTASYONU

### 1. Next.js 15 Kurulumu

**Proje Yapısı:**
```
frontend/
├── app/
│   ├── isletmeler/[slug]/page.tsx  # İşletme detay sayfası
│   ├── globals.css                  # Global stiller
│   ├── layout.tsx                   # Root layout
│   └── page.tsx                     # Ana sayfa
├── components/
│   ├── StarRating.tsx               # Yıldız rating bileşeni
│   ├── BusinessCard.tsx             # İşletme kartı
│   └── ReviewModal.tsx              # Yorum modal'ı
├── public/                          # Statik dosyalar
├── next.config.js                   # Next.js config
├── tailwind.config.ts               # Tailwind config
├── tsconfig.json                    # TypeScript config
└── package.json                     # Dependencies
```

**Teknoloji Stack:**
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Lucide React (İkonlar)

---

### 2. Tasarım Sistemi (`app/globals.css`)

#### Renk Paleti
```css
:root {
  --primary-green: #00b67a;    /* Trust Green - Ana renk */
  --secondary-dark: #191919;   /* Koyu gri - Metin */
  --background: #f7f7f7;       /* Açık gri - Arka plan */
}
```

#### Tailwind Konfigürasyonu
```typescript
colors: {
  primary: {
    DEFAULT: '#00b67a',
    50: '#e6f9f2',
    100: '#ccf3e5',
    // ... 900'e kadar tonlar
  },
  secondary: {
    DEFAULT: '#191919',
    // ... tonlar
  },
  background: '#f7f7f7',
}
```

#### Custom CSS Utilities
```css
/* Yıldız Rating - Kare Stil */
.star-square {
  width: 20px;
  height: 20px;
  background-color: var(--primary-green);
  clip-path: polygon(
    50% 0%, 61% 35%, 98% 35%, 68% 57%, 
    79% 91%, 50% 70%, 21% 91%, 32% 57%, 
    2% 35%, 39% 35%
  );
}

/* Sticky Sidebar */
.sticky-sidebar {
  position: sticky;
  top: 1rem;
  align-self: start;
}

/* Horizontal Scroll */
.horizontal-scroll {
  display: flex;
  overflow-x: auto;
  scroll-behavior: smooth;
}

/* Card Hover Effect */
.card-hover {
  transition: transform 0.2s ease-in-out;
}
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

/* Rozet Stilleri */
.badge-bronze { background: #cd7f32; color: white; }
.badge-silver { background: #c0c0c0; color: #333; }
.badge-gold { background: #ffd700; color: #333; }
.badge-platinum { background: #e5e4e2; color: #333; }
.badge-verified { background: var(--primary-green); color: white; }

/* Animasyonlar */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.animate-fade-in {
  animation: fadeIn 0.2s ease-in-out;
}
```

---

### 3. Ana Sayfa (`app/page.tsx`)

#### Bölümler

**A. Hero Section**
```tsx
<section className="bg-white py-16 px-4">
  <h1 className="text-5xl font-bold text-secondary mb-6">
    Güvendiğin İşletmeyi Keşfet
  </h1>
  <p className="text-xl text-gray-600 mb-8">
    Gerçek kullanıcı deneyimleri ile doğru kararlar verin
  </p>
  
  {/* Arama Çubuğu */}
  <input 
    type="text"
    placeholder="İşletme ara..."
    className="w-full px-6 py-4 rounded-full border-2 shadow-lg"
  />
</section>
```

**B. Öne Çıkan İşletmeler**
```tsx
<section className="py-12 px-4">
  <h2 className="text-3xl font-bold mb-8">Öne Çıkan İşletmeler</h2>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    {businesses.map(business => (
      <Link href={`/isletmeler/${business.slug}`}>
        <BusinessCard {...business} />
      </Link>
    ))}
  </div>
</section>
```

**C. Kategoriler**
```tsx
<section className="py-12 px-4 bg-white">
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
    {categories.map(category => (
      <div className="hover:scale-105 transition-transform">
        {/* Kategori kartı */}
      </div>
    ))}
  </div>
</section>
```

**D. Footer**
```tsx
<footer className="bg-secondary text-white py-12">
  <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
    <div>Kurumsal</div>
    <div>Yasal</div>
    <div>Sosyal Medya</div>
  </div>
</footer>
```

---

### 4. İşletme Detay Sayfası (`app/isletmeler/[slug]/page.tsx`)

#### Dual-Sticky Sidebar Mimarisi

**ÜST BÖLÜM: 2-Sütun Grid**
```tsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
  {/* Sol: İşletme Bilgileri (8/12) */}
  <div className="lg:col-span-8">
    <div className="bg-white rounded-lg p-6">
      <h1>{businessData.name}</h1>
      <p>{businessData.description}</p>
      {/* Adres, telefon, website */}
    </div>
  </div>

  {/* Sağ: Rating Kartı - STICKY (4/12) */}
  <div className="lg:col-span-4">
    <div className="sticky-sidebar">
      <div className="bg-white rounded-lg p-6">
        <div className="text-6xl font-bold text-primary">4.9</div>
        <StarRating rating={4.9} size="lg" />
        <p>1,234 değerlendirme</p>
        <button onClick={handleOpenReviewModal}>
          Yorum Yaz
        </button>
      </div>
    </div>
  </div>
</div>
```

**ORTA BÖLÜM: Tam Genişlik Carousel**
```tsx
<div className="mb-12">
  <h2>İnsanlar Bunlara da Baktı</h2>
  <div className="horizontal-scroll gap-4">
    {relatedBusinesses.map(business => (
      <Link href={`/isletmeler/${business.slug}`}>
        <div className="min-w-[280px] card-hover">
          {/* İşletme kartı */}
        </div>
      </Link>
    ))}
  </div>
</div>
```

**ALT BÖLÜM: Ters Grid (Sticky Sol)**
```tsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
  {/* Sol: Review İstatistikleri - STICKY (4/12) */}
  <div className="lg:col-span-4 order-2 lg:order-1">
    <div className="sticky-sidebar">
      <div className="bg-white rounded-lg p-6">
        <h3>Puan Dağılımı</h3>
        {[5,4,3,2,1].map(star => (
          <div className="flex items-center gap-3">
            <span>{star} ⭐</span>
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div className="bg-primary h-2 rounded-full" 
                   style={{width: `${percentage}%`}} />
            </div>
            <span>{percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  </div>

  {/* Sağ: Yorum Listesi & Filtreler (8/12) */}
  <div className="lg:col-span-8 order-1 lg:order-2">
    {/* Filtreler */}
    <div className="bg-white rounded-lg p-4 mb-6">
      <button onClick={() => setFilter('all')}>Tümü</button>
      <button onClick={() => setFilter('5')}>5 ⭐</button>
      {/* ... diğer filtreler */}
    </div>

    {/* Yorumlar */}
    <div className="space-y-6">
      {reviews.map(review => (
        <div className="bg-white rounded-lg p-6">
          {/* Yorum içeriği */}
        </div>
      ))}
    </div>
  </div>
</div>
```

#### Breadcrumb Navigation
```tsx
<nav className="flex items-center gap-2">
  <Link href="/">
    <Home size={16} />
    Ana Sayfa
  </Link>
  <span>/</span>
  <Link href="/isletmeler">İşletmeler</Link>
  <span>/</span>
  <span>{businessData.name}</span>
</nav>
```

#### Responsive Davranış
```css
@media (max-width: 768px) {
  .sticky-sidebar {
    position: relative;
    top: 0;
  }
  
  .grid {
    grid-template-columns: 1fr;
  }
}
```

---

### 5. StarRating Bileşeni (`components/StarRating.tsx`)

**Özellikler:**
- ✅ Kare yeşil yıldızlar (Trustpilot stili)
- ✅ Yarım yıldız desteği
- ✅ 3 boyut: sm, md, lg
- ✅ Opsiyonel sayı gösterimi

**Kullanım:**
```tsx
<StarRating 
  rating={4.9} 
  size="md" 
  showNumber={true} 
/>
```

**Implementasyon:**
```tsx
export default function StarRating({ rating, size = 'md', showNumber = false }) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= fullStars;
          const isHalf = star === fullStars + 1 && hasHalfStar;

          return (
            <div
              key={star}
              className={`${sizeClasses[size]} relative`}
              style={{
                clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
              }}
            >
              <div className="absolute inset-0 bg-gray-300" />
              {(isFilled || isHalf) && (
                <div
                  className="absolute inset-0 bg-primary"
                  style={{ width: isHalf ? '50%' : '100%' }}
                />
              )}
            </div>
          );
        })}
      </div>
      {showNumber && <span className="font-semibold text-primary">{rating.toFixed(1)}</span>}
    </div>
  );
}
```

---

### 6. BusinessCard Bileşeni (`components/BusinessCard.tsx`)

**Props:**
```typescript
interface BusinessCardProps {
  id: string;
  name: string;
  slug: string;
  rating: number;
  totalReviews: number;
  isVerified?: boolean;
  category?: string;
}
```

**Render:**
```tsx
<div className="bg-white rounded-lg p-6 shadow-md card-hover">
  <div className="flex items-start justify-between mb-4">
    <div>
      <h3 className="font-bold text-lg">{name}</h3>
      {category && <p className="text-sm text-gray-500">{category}</p>}
    </div>
    {isVerified && (
      <span className="badge badge-verified text-xs">Doğrulanmış</span>
    )}
  </div>
  
  <div className="flex items-center gap-2 mb-2">
    <StarRating rating={rating} size="sm" />
    <span className="font-semibold text-primary">{rating.toFixed(1)}</span>
  </div>
  
  <p className="text-sm text-gray-600">
    {totalReviews.toLocaleString('tr-TR')} değerlendirme
  </p>
</div>
```

---

### 7. ReviewModal Bileşeni (`components/ReviewModal.tsx`)

#### Özellikler

**A. İnteraktif 5-Yıldız Rating**
```tsx
{[1, 2, 3, 4, 5].map((star) => (
  <button
    type="button"
    onClick={() => setRating(star)}
    onMouseEnter={() => setHoveredRating(star)}
    onMouseLeave={() => setHoveredRating(0)}
    className="transition-transform hover:scale-110"
  >
    <div
      className={`w-12 h-12 ${
        star <= (hoveredRating || rating) ? 'bg-primary' : 'bg-gray-300'
      }`}
      style={{
        clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
      }}
    />
  </button>
))}
```

**Emoji Feedback:**
```tsx
{rating === 5 && '⭐ Mükemmel!'}
{rating === 4 && '👍 Çok İyi'}
{rating === 3 && '😊 İyi'}
{rating === 2 && '😐 Orta'}
{rating === 1 && '😞 Kötü'}
```

**B. Form Validasyonu**
```tsx
const maxTitleLength = 100;
const maxContentLength = 1000;
const minContentLength = 50;

// Validasyon
if (rating === 0) {
  setError('Lütfen bir puan seçin');
  return;
}

if (content.length < minContentLength) {
  setError(`Yorum en az ${minContentLength} karakter olmalıdır`);
  return;
}
```

**C. Karakter Sayacı**
```tsx
<div className="flex justify-between items-center mt-1">
  <p className="text-xs text-gray-500">
    En az {minContentLength} karakter gerekli
  </p>
  <span className={`text-xs ${
    content.length < minContentLength ? 'text-red-500' : 'text-gray-400'
  }`}>
    {content.length}/{maxContentLength}
  </span>
</div>
```

**D. Loading State**
```tsx
<button
  type="submit"
  disabled={isSubmitting || rating === 0 || content.length < minContentLength}
  className="flex-1 px-6 py-3 bg-primary text-white rounded-lg..."
>
  {isSubmitting ? (
    <>
      <Loader2 size={20} className="animate-spin" />
      <span>Gönderiliyor...</span>
    </>
  ) : (
    <span>Gönder</span>
  )}
</button>
```

**E. Success Screen**
```tsx
if (showSuccess) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 animate-fade-in">
        <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-secondary mb-2">Teşekkürler!</h3>
        <p className="text-gray-600">
          Yorumunuz başarıyla gönderildi. Katkınız için teşekkür ederiz.
        </p>
      </div>
    </div>
  );
}
```

**F. API Entegrasyonu**
```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsSubmitting(true);

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        businessId,
        rating,
        title: title.trim() || undefined,
        content: content.trim(),
      }),
    });

    if (!response.ok) throw new Error('Yorum gönderilemedi');

    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      resetForm();
      onClose();
      onSuccess();
    }, 2000);

  } catch (err) {
    setError(err.message);
  } finally {
    setIsSubmitting(false);
  }
};
```

---

### 8. URL Lokalizasyonu

#### Değişiklik
```
ÖNCE: /business/[slug]
SONRA: /isletmeler/[slug]
```

#### Implementasyon

**A. Dizin Yeniden Adlandırma**
```bash
frontend/app/business → frontend/app/isletmeler
```

**B. Ana Sayfa Linkleri**
```tsx
<Link href={`/isletmeler/ornek-isletme-${item}`}>
  <BusinessCard {...business} />
</Link>
```

**C. Breadcrumb Navigation**
```tsx
<nav className="flex items-center gap-2">
  <Link href="/">
    <Home size={16} />
    Ana Sayfa
  </Link>
  <span>/</span>
  <Link href="/isletmeler">İşletmeler</Link>
  <span>/</span>
  <span>{businessData.name}</span>
</nav>
```

**D. Geri Dön Butonu**
```tsx
<Link href="/" className="inline-flex items-center gap-2">
  <ChevronLeft size={20} />
  <span>Geri Dön</span>
</Link>
```

**E. İlgili İşletmeler**
```tsx
{relatedBusinesses.map((business) => (
  <Link
    key={business.id}
    href={`/isletmeler/${business.slug}`}
    className="bg-white rounded-lg p-4 shadow-md min-w-[280px]"
  >
    {/* İşletme kartı */}
  </Link>
))}
```

---

## 📁 DOSYA YAPISI

### Backend
```
tecrubelerim/
├── src/
│   ├── services/
│   │   └── userService.js          ✅ Trust score & badge sistemi
│   ├── routes/
│   │   ├── authRoutes.js           ✅ /auth/me endpoint eklendi
│   │   ├── reviewRoutes.js         ✅ Trust score entegrasyonu
│   │   └── businessRoutes.js       ✅ Mevcut
│   ├── middleware/
│   │   └── auth.js                 ✅ JWT authentication
│   ├── utils/
│   │   └── slugify.js              ✅ Slug oluşturma
│   └── index.js                    ✅ Ana server dosyası
├── prisma/
│   ├── schema.prisma               ✅ Database schema
│   └── seed.js                     ✅ Test verileri
├── scripts/
│   ├── update-empty-slugs.js       ✅ Slug güncelleme
│   └── seed-test-businesses.js     ✅ Test işletmeleri
├── docs/                           ✅ Dokümantasyon
├── .env                            ✅ Environment variables
├── docker-compose.yml              ✅ PostgreSQL container
└── package.json                    ✅ Dependencies
```

### Frontend
```
tecrubelerim/frontend/
├── app/
│   ├── isletmeler/
│   │   └── [slug]/
│   │       └── page.tsx            ✅ İşletme detay sayfası
│   ├── globals.css                 ✅ Global stiller + utilities
│   ├── layout.tsx                  ✅ Root layout
│   └── page.tsx                    ✅ Ana sayfa
├── components/
│   ├── StarRating.tsx              ✅ Yıldız rating bileşeni
│   ├── BusinessCard.tsx            ✅ İşletme kartı
│   └── ReviewModal.tsx             ✅ Yorum modal'ı
├── public/                         ✅ Statik dosyalar
├── next.config.js                  ✅ Next.js konfigürasyonu
├── tailwind.config.ts              ✅ Tailwind konfigürasyonu
├── tsconfig.json                   ✅ TypeScript konfigürasyonu
├── postcss.config.js               ✅ PostCSS konfigürasyonu
├── .env.example                    ✅ Environment template
├── .gitignore                      ✅ Git ignore
├── package.json                    ✅ Dependencies
└── README.md                       ✅ Frontend dokümantasyonu
```

### Dokümantasyon
```
tecrubelerim/
├── README.md                                ✅ Genel proje bilgisi
├── SETUP_GUIDE.md                          ✅ Kurulum rehberi
├── API_TESTING.md                          ✅ API test dokümantasyonu
├── MVP_SUMMARY.md                          ✅ MVP özeti
├── STRATEGIC_INTELLIGENCE.md               ✅ Stratejik bilgiler
├── SEO_SLUG_IMPLEMENTATION.md              ✅ SEO slug sistemi
├── FRONTEND_IMPLEMENTATION.md              ✅ Frontend implementasyonu
├── frontend/
│   ├── README.md                           ✅ Frontend özgü dokümantasyon
│   ├── URL_LOCALIZATION.md                 ✅ URL lokalizasyonu
│   └── REVIEW_MODAL_IMPLEMENTATION.md      ✅ Review modal dokümantasyonu
└── COMPLETE_PROJECT_SUMMARY.md             ✅ Bu dosya
```

---

## 🔌 API ENDPOINTS

### Authentication