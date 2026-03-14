'use client';

import StarRating from './StarRating';

interface BusinessCardProps {
  id: string;
  name: string;
  slug: string;
  rating: number;
  totalReviews: number;
  isVerified?: boolean;
  category?: string;
}

export default function BusinessCard({
  name,
  slug,
  rating,
  totalReviews,
  isVerified = false,
  category,
}: BusinessCardProps) {
  return (
    <div className="bg-white rounded-lg p-6 shadow-md card-hover cursor-pointer">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-lg mb-1">{name}</h3>
          {category && (
            <p className="text-sm text-gray-500">{category}</p>
          )}
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
  );
}
