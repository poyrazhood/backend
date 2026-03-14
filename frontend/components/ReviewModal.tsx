'use client';

import { useState } from 'react';
import { X, Star, Loader2 } from 'lucide-react';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  businessName: string;
  onSuccess: () => void;
}

export default function ReviewModal({
  isOpen,
  onClose,
  businessId,
  businessName,
  onSuccess,
}: ReviewModalProps) {
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');

  const maxTitleLength = 100;
  const maxContentLength = 1000;
  const minContentLength = 50;

  // Modal kapalıysa render etme
  if (!isOpen) return null;

  // Yorum gönderme fonksiyonu
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validasyon
    if (rating === 0) {
      setError('Lütfen bir puan seçin');
      return;
    }

    if (content.length < minContentLength) {
      setError(`Yorum en az ${minContentLength} karakter olmalıdır`);
      return;
    }

    setIsSubmitting(true);

    try {
      // API çağrısı (şimdilik mock)
      // TODO: Gerçek API endpoint'i ile değiştir
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // TODO: Authentication token ekle
          // 'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          businessId,
          rating,
          title: title.trim() || undefined,
          content: content.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Yorum gönderilemedi');
      }

      // Başarılı mesajı göster
      setShowSuccess(true);

      // 2 saniye sonra modal'ı kapat ve parent component'i bilgilendir
      setTimeout(() => {
        setShowSuccess(false);
        resetForm();
        onClose();
        onSuccess();
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Form'u sıfırla
  const resetForm = () => {
    setRating(0);
    setHoveredRating(0);
    setTitle('');
    setContent('');
    setError('');
  };

  // Modal'ı kapat
  const handleClose = () => {
    if (!isSubmitting) {
      resetForm();
      onClose();
    }
  };

  // Başarı mesajı gösteriliyorsa
  if (showSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center animate-fade-in">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-2xl font-bold text-secondary">Yorum Yaz</h2>
            <p className="text-sm text-gray-600 mt-1">{businessName}</p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 transition disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Puan Seçimi */}
          <div>
            <label className="block text-sm font-semibold text-secondary mb-3">
              Puanınız <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="transition-transform hover:scale-110 focus:outline-none"
                >
                  <div
                    className={`w-12 h-12 transition-colors ${
                      star <= (hoveredRating || rating)
                        ? 'bg-primary'
                        : 'bg-gray-300'
                    }`}
                    style={{
                      clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
                    }}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="ml-2 text-lg font-semibold text-primary">
                  {rating}.0
                </span>
              )}
            </div>
            {rating > 0 && (
              <p className="text-sm text-gray-600 mt-2">
                {rating === 5 && '⭐ Mükemmel!'}
                {rating === 4 && '👍 Çok İyi'}
                {rating === 3 && '😊 İyi'}
                {rating === 2 && '😐 Orta'}
                {rating === 1 && '😞 Kötü'}
              </p>
            )}
          </div>

          {/* Başlık (Opsiyonel) */}
          <div>
            <label htmlFor="title" className="block text-sm font-semibold text-secondary mb-2">
              Başlık (Opsiyonel)
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, maxTitleLength))}
              placeholder="Örn: Harika bir deneyim"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-primary focus:outline-none transition"
              disabled={isSubmitting}
            />
            <div className="flex justify-between items-center mt-1">
              <p className="text-xs text-gray-500">Yorumunuzu özetleyen kısa bir başlık</p>
              <span className="text-xs text-gray-400">
                {title.length}/{maxTitleLength}
              </span>
            </div>
          </div>

          {/* Yorum İçeriği */}
          <div>
            <label htmlFor="content" className="block text-sm font-semibold text-secondary mb-2">
              Yorumunuz <span className="text-red-500">*</span>
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, maxContentLength))}
              placeholder="Deneyiminizi detaylı bir şekilde anlatın..."
              rows={6}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-primary focus:outline-none transition resize-none"
              disabled={isSubmitting}
            />
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
          </div>

          {/* Hata Mesajı */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Gönder Butonu */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition disabled:opacity-50"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || rating === 0 || content.length < minContentLength}
              className="flex-1 px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
          </div>
        </form>
      </div>
    </div>
  );
}
