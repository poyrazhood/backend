'use client';

import { useState } from 'react';
import Link from 'next/link';
import StarRating from '@/components/StarRating';
import ReviewModal from '@/components/ReviewModal';
import { Star, ThumbsUp, Flag, Filter, ChevronLeft, Home } from 'lucide-react';

// Mock data - Bu gerçek API'den gelecek
const businessData = {
  id: '1',
  name: 'Örnek İşletme',
  slug: 'ornek-isletme',
  category: 'Teknoloji',
  rating: 4.9,
  totalReviews: 1234,
  isVerified: true,
  description: 'Türkiye\'nin önde gelen teknoloji şirketlerinden biri.',
  address: 'İstanbul, Türkiye',
  phone: '+90 212 123 45 67',
  website: 'https://example.com',
};

const mockReviews = [
  {
    id: '1',
    rating: 5,
    title: 'Harika bir deneyim',
    content: 'Ürün kalitesi ve müşteri hizmetleri mükemmel. Kesinlikle tavsiye ederim.',
    author: {
      username: 'kullanici1',
      badgeLevel: 'GOLD',
      trustScore: 85,
    },
    helpfulCount: 24,
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    rating: 4,
    title: 'Genel olarak memnunum',
    content: 'Hizmet kalitesi iyi ancak teslimat süresi biraz uzun oldu.',
    author: {
      username: 'kullanici2',
      badgeLevel: 'SILVER',
      trustScore: 72,
    },
    helpfulCount: 12,
    createdAt: '2024-01-10',
  },
];

const relatedBusinesses = [
  { id: '2', name: 'Benzer İşletme 1', slug: 'benzer-isletme-1', rating: 4.7, totalReviews: 890 },
  { id: '3', name: 'Benzer İşletme 2', slug: 'benzer-isletme-2', rating: 4.8, totalReviews: 654 },
  { id: '4', name: 'Benzer İşletme 3', slug: 'benzer-isletme-3', rating: 4.6, totalReviews: 432 },
  { id: '5', name: 'Benzer İşletme 4', slug: 'benzer-isletme-4', rating: 4.9, totalReviews: 1100 },
];

export default function BusinessDetailPage() {
  const [selectedFilter, setSelectedFilter] = useState<'all' | '5' | '4' | '3' | '2' | '1'>('all');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviews, setReviews] = useState(mockReviews);

  // Yorum modal'ını aç
  const handleOpenReviewModal = () => {
    setIsReviewModalOpen(true);
  };

  // Yorum modal'ını kapat
  const handleCloseReviewModal = () => {
    setIsReviewModalOpen(false);
  };

  // Yorum başarıyla gönderildiğinde
  const handleReviewSuccess = () => {
    // TODO: Gerçek API'den yorumları yeniden çek
    console.log('Yorum başarıyla gönderildi, yorumlar yenileniyor...');
    // Şimdilik mock data'yı kullan
  };

  const getBadgeColor = (badge: string) => {
    switch (badge) {
      case 'GOLD': return 'badge-gold';
      case 'SILVER': return 'badge-silver';
      case 'BRONZE': return 'badge-bronze';
      case 'PLATINUM': return 'badge-platinum';
      default: return 'bg-gray-200 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white shadow-sm py-4 px-4">
        <div className="max-w-7xl mx-auto">
          <Link href="/" className="text-2xl font-bold text-secondary hover:text-primary transition">
            Tecrubelerim
          </Link>
        </div>
      </header>

      {/* Breadcrumbs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/" className="flex items-center gap-1 text-gray-600 hover:text-primary transition">
              <Home size={16} />
              <span>Ana Sayfa</span>
            </Link>
            <span className="text-gray-400">/</span>
            <Link href="/isletmeler" className="text-gray-600 hover:text-primary transition">
              İşletmeler
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-900 font-medium">{businessData.name}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-primary transition mb-6"
        >
          <ChevronLeft size={20} />
          <span>Geri Dön</span>
        </Link>
        {/* TOP SECTION: 2-Column Grid with Sticky Right Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
          {/* Left: Business Info (8 columns) */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-lg p-6 shadow-md">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-3xl font-bold mb-2">{businessData.name}</h1>
                  <p className="text-gray-600">{businessData.category}</p>
                </div>
                {businessData.isVerified && (
                  <span className="badge badge-verified">Doğrulanmış</span>
                )}
              </div>
              
              <p className="text-gray-700 mb-4">{businessData.description}</p>
              
              <div className="space-y-2 text-sm text-gray-600">
                <p><strong>Adres:</strong> {businessData.address}</p>
                <p><strong>Telefon:</strong> {businessData.phone}</p>
                <p><strong>Website:</strong> <a href={businessData.website} className="text-primary hover:underline">{businessData.website}</a></p>
              </div>
            </div>
          </div>

          {/* Right: Rating Card - STICKY (4 columns) */}
          <div className="lg:col-span-4">
            <div className="sticky-sidebar">
              <div className="bg-white rounded-lg p-6 shadow-md">
                <div className="text-center mb-6">
                  <div className="text-6xl font-bold text-primary mb-2">
                    {businessData.rating.toFixed(1)}
                  </div>
                  <StarRating rating={businessData.rating} size="lg" className="justify-center mb-2" />
                  <p className="text-gray-600">
                    {businessData.totalReviews.toLocaleString('tr-TR')} değerlendirme
                  </p>
                </div>
                
                <button
                  onClick={handleOpenReviewModal}
                  className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-600 transition flex items-center justify-center gap-2"
                >
                  <Star size={20} />
                  Yorum Yaz
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* MIDDLE SECTION: Full-Width Horizontal Carousel */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-4">İnsanlar Bunlara da Baktı</h2>
          <div className="horizontal-scroll gap-4 pb-4">
            {relatedBusinesses.map((business) => (
              <Link
                key={business.id}
                href={`/isletmeler/${business.slug}`}
                className="bg-white rounded-lg p-4 shadow-md min-w-[280px] card-hover cursor-pointer block"
              >
                <h3 className="font-bold mb-2">{business.name}</h3>
                <div className="flex items-center gap-2 mb-1">
                  <StarRating rating={business.rating} size="sm" />
                  <span className="font-semibold text-primary">{business.rating.toFixed(1)}</span>
                </div>
                <p className="text-sm text-gray-600">
                  {business.totalReviews.toLocaleString('tr-TR')} değerlendirme
                </p>
              </Link>
            ))}
          </div>
        </div>

        {/* BOTTOM SECTION: Flipped Grid - Sticky Left Sidebar for Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Review Stats - STICKY (4 columns) */}
          <div className="lg:col-span-4 order-2 lg:order-1">
            <div className="sticky-sidebar">
              <div className="bg-white rounded-lg p-6 shadow-md">
                <h3 className="font-bold text-lg mb-4">Puan Dağılımı</h3>
                
                {[5, 4, 3, 2, 1].map((star) => (
                  <div key={star} className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-medium w-8">{star} ⭐</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full"
                        style={{ width: `${star === 5 ? 80 : star === 4 ? 15 : 5}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-600 w-12 text-right">
                      {star === 5 ? '80%' : star === 4 ? '15%' : '5%'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Review Feed & Filters (8 columns) */}
          <div className="lg:col-span-8 order-1 lg:order-2">
            {/* Filters */}
            <div className="bg-white rounded-lg p-4 shadow-md mb-6">
              <div className="flex items-center gap-2 flex-wrap">
                <Filter size={20} className="text-gray-600" />
                <button
                  onClick={() => setSelectedFilter('all')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    selectedFilter === 'all'
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Tümü
                </button>
                {[5, 4, 3, 2, 1].map((rating) => (
                  <button
                    key={rating}
                    onClick={() => setSelectedFilter(rating.toString() as any)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                      selectedFilter === rating.toString()
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {rating} ⭐
                  </button>
                ))}
              </div>
            </div>

            {/* Reviews */}
            <div className="space-y-6">
              {mockReviews.map((review) => (
                <div key={review.id} className="bg-white rounded-lg p-6 shadow-md">
                  {/* Review Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="text-primary font-bold text-lg">
                          {review.author.username[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{review.author.username}</span>
                          <span className={`badge ${getBadgeColor(review.author.badgeLevel)} text-xs`}>
                            {review.author.badgeLevel}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500">{review.createdAt}</p>
                      </div>
                    </div>
                    <button className="text-gray-400 hover:text-gray-600">
                      <Flag size={18} />
                    </button>
                  </div>

                  {/* Rating */}
                  <StarRating rating={review.rating} size="sm" className="mb-3" />

                  {/* Review Content */}
                  <h4 className="font-bold mb-2">{review.title}</h4>
                  <p className="text-gray-700 mb-4">{review.content}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-4 pt-4 border-t">
                    <button className="flex items-center gap-2 text-gray-600 hover:text-primary transition">
                      <ThumbsUp size={18} />
                      <span className="text-sm">Yararlı ({review.helpfulCount})</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Review Modal */}
      <ReviewModal
        isOpen={isReviewModalOpen}
        onClose={handleCloseReviewModal}
        businessId={businessData.id}
        businessName={businessData.name}
        onSuccess={handleReviewSuccess}
      />
    </div>
  );
}
