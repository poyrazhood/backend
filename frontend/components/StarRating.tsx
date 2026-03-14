'use client';

interface StarRatingProps {
  rating: number; // 0-5
  size?: 'sm' | 'md' | 'lg';
  showNumber?: boolean;
  className?: string;
}

export default function StarRating({ 
  rating, 
  size = 'md', 
  showNumber = false,
  className = '' 
}: StarRatingProps) {
  // Boyut ayarları
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const starSize = sizeClasses[size];
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= fullStars;
          const isHalf = star === fullStars + 1 && hasHalfStar;

          return (
            <div
              key={star}
              className={`${starSize} relative`}
              style={{
                clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
              }}
            >
              {/* Background (empty star) */}
              <div className="absolute inset-0 bg-gray-300" />
              
              {/* Filled portion */}
              {(isFilled || isHalf) && (
                <div
                  className="absolute inset-0 bg-primary"
                  style={{
                    width: isHalf ? '50%' : '100%',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      
      {showNumber && (
        <span className="font-semibold text-primary">
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}
