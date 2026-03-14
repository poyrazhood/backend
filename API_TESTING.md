# Tecrubelerim.com API Testing Guide

## Base URL
```
http://localhost:3000
```

## Authentication Endpoints

### 1. Register User
```bash
POST /auth/register
Content-Type: application/json

{
  "email": "test@example.com",
  "username": "testuser",
  "password": "SecurePass123!"
}

# Response:
{
  "message": "User registered successfully",
  "user": {
    "id": "...",
    "username": "testuser",
    "email": "test@example.com"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 2. Login User
```bash
POST /auth/login
Content-Type: application/json

{
  "identifier": "testuser",  # Can be email or username
  "password": "SecurePass123!"
}

# Response:
{
  "message": "Logged in successfully",
  "user": {
    "id": "...",
    "username": "testuser",
    "email": "test@example.com"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Business Endpoints

### 3. Create Business (Protected)
```bash
POST /businesses
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "name": "Kahve Diyarı",
  "address": "Atatürk Caddesi No:123",
  "city": "İstanbul",
  "district": "Kadıköy",
  "categoryId": "CATEGORY_ID_FROM_SEED",
  "description": "En iyi kahve deneyimi için bizi ziyaret edin",
  "phoneNumber": "+90 555 123 4567",
  "email": "info@kahvediyari.com",
  "website": "https://kahvediyari.com",
  "attributes": {
    "wifi_available": true,
    "outdoor_seating": true,
    "opening_hours": {
      "monday": "08:00-22:00",
      "tuesday": "08:00-22:00",
      "wednesday": "08:00-22:00",
      "thursday": "08:00-22:00",
      "friday": "08:00-23:00",
      "saturday": "09:00-23:00",
      "sunday": "09:00-22:00"
    }
  }
}

# Response:
{
  "message": "Business created successfully",
  "business": {
    "id": "...",
    "name": "Kahve Diyarı",
    "slug": "kahve-diyari",
    ...
  }
}
```

### 4. Get All Businesses (Public)
```bash
GET /businesses?page=1&limit=20&city=İstanbul&search=kahve

# Response:
{
  "businesses": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

### 5. Get Business by Slug (Public)
```bash
GET /businesses/kahve-diyari

# Response:
{
  "business": {
    "id": "...",
    "name": "Kahve Diyarı",
    "slug": "kahve-diyari",
    "averageRating": 4.5,
    "totalReviews": 10,
    "totalViews": 150,
    "verifiedBusiness": false,
    "category": {...},
    "owner": {...},
    "reviews": [...]
  }
}
```

### 6. Update Business (Protected - Owner Only)
```bash
PUT /businesses/kahve-diyari
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "description": "Yeni açıklama",
  "phoneNumber": "+90 555 999 8888"
}

# Response:
{
  "message": "Business updated successfully",
  "business": {...}
}
```

### 7. Delete Business (Protected - Owner Only)
```bash
DELETE /businesses/kahve-diyari
Authorization: Bearer YOUR_TOKEN_HERE

# Response:
{
  "message": "Business deleted successfully"
}
```

---

## Review Endpoints

### 8. Create Review (Protected)
```bash
POST /reviews
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "businessId": "BUSINESS_ID_HERE",
  "rating": 5,
  "title": "Harika bir deneyim!",
  "content": "Kahveleri çok lezzetli, personel çok ilgili. Kesinlikle tavsiye ederim!"
}

# Response:
{
  "message": "Review created successfully",
  "review": {
    "id": "...",
    "rating": 5,
    "title": "Harika bir deneyim!",
    "content": "...",
    "isPublished": true,
    "isFlagged": false,
    "fraudDetectionMetadata": {
      "fraud_score": 15,
      "detection_method": "rule_based",
      "risk_factors": [],
      "automated_action": "publish"
    }
  },
  "fraudDetection": {...}
}
```

### 9. Get Reviews for Business (Public)
```bash
GET /reviews/business/BUSINESS_ID?page=1&limit=20&rating=5

# Response:
{
  "reviews": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 10,
    "totalPages": 1
  }
}
```

### 10. Get My Reviews (Protected)
```bash
GET /reviews/my-reviews?page=1&limit=20
Authorization: Bearer YOUR_TOKEN_HERE

# Response:
{
  "reviews": [...],
  "pagination": {...}
}
```

### 11. Update Review (Protected - Author Only)
```bash
PUT /reviews/REVIEW_ID
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "rating": 4,
  "content": "Güncellenen yorum içeriği"
}

# Response:
{
  "message": "Review updated successfully",
  "review": {...},
  "fraudDetection": {...}
}
```

### 12. Delete Review (Protected - Author Only)
```bash
DELETE /reviews/REVIEW_ID
Authorization: Bearer YOUR_TOKEN_HERE

# Response:
{
  "message": "Review deleted successfully"
}
```

### 13. Mark Review as Helpful (Protected)
```bash
POST /reviews/REVIEW_ID/helpful
Authorization: Bearer YOUR_TOKEN_HERE

# Response:
{
  "message": "Review marked as helpful"
}
```

---

## Health Check

### 14. Health Check (Public)
```bash
GET /health

# Response:
{
  "status": "healthy",
  "timestamp": "2026-02-23T22:41:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### 15. Root Endpoint (Public)
```bash
GET /

# Response:
{
  "name": "Tecrubelerim.com API",
  "version": "0.1.0",
  "status": "operational",
  "message": "High-trust local business discovery platform",
  "endpoints": {
    "health": "/health",
    "docs": "/docs (coming soon)"
  }
}
```

---

## Fraud Detection Examples

### Example 1: Clean Review (Published)
```json
{
  "rating": 4,
  "content": "Güzel bir mekan, kahveleri lezzetli. Personel ilgili ve güler yüzlü. Fiyatlar makul seviyede."
}

// Fraud Score: ~10 (Low risk, published immediately)
```

### Example 2: Suspicious Review (Flagged)
```json
{
  "rating": 5,
  "content": "BEST EVER!!!! HIGHLY RECOMMEND!!!!"
}

// Fraud Score: ~45 (Medium risk, flagged for review)
// Risk Factors: ["short_extreme_rating", "all_caps", "excessive_punctuation", "generic_template"]
```

### Example 3: High Risk Review (Quarantined)
```json
{
  "rating": 1,
  "content": "WORST!!!"
}

// Fraud Score: ~70 (High risk, quarantined for manual review)
// Risk Factors: ["short_extreme_rating", "all_caps", "excessive_punctuation", "low_trust_user"]
```

---

## Testing with cURL

### Register and Login
```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"SecurePass123!"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"testuser","password":"SecurePass123!"}'
```

### Create Business
```bash
# Get category ID first
curl http://localhost:3000/businesses

# Create business (replace TOKEN and CATEGORY_ID)
curl -X POST http://localhost:3000/businesses \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Test Kafe",
    "address":"Test Sokak No:1",
    "city":"İstanbul",
    "district":"Kadıköy",
    "categoryId":"CATEGORY_ID",
    "description":"Test açıklama"
  }'
```

### Create Review
```bash
# Create review (replace TOKEN and BUSINESS_ID)
curl -X POST http://localhost:3000/reviews \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "businessId":"BUSINESS_ID",
    "rating":5,
    "title":"Harika!",
    "content":"Çok güzel bir mekan, kesinlikle tavsiye ederim."
  }'
```

---

## Testing with Postman

1. **Import Collection**: Create a new Postman collection
2. **Set Environment Variables**:
   - `base_url`: `http://localhost:3000`
   - `token`: (will be set after login)
3. **Test Flow**:
   - Register → Save token
   - Login → Update token
   - Create Business → Save business ID
   - Create Review → Test fraud detection
   - Get Business → See reviews

---

## Error Responses

### 400 Bad Request
```json
{
  "message": "Email, username, and password are required"
}
```

### 401 Unauthorized
```json
{
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "message": "You are not authorized to update this business"
}
```

### 404 Not Found
```json
{
  "message": "Business not found"
}
```

### 409 Conflict
```json
{
  "message": "User with this email or username already exists"
}
```

### 500 Internal Server Error
```json
{
  "message": "Internal server error during registration"
}
```

---

## Next Steps

1. **Test all endpoints** using cURL or Postman
2. **Verify fraud detection** with different review patterns
3. **Check database** using `npm run db:studio`
4. **Monitor logs** in the terminal running `npm run dev`
5. **Test edge cases** (invalid data, missing fields, etc.)

---

## Notes

- All protected endpoints require `Authorization: Bearer TOKEN` header
- Fraud detection runs automatically on review creation/update
- Reviews with fraud_score > 60 are quarantined
- Reviews with fraud_score 30-60 are flagged
- Reviews with fraud_score < 30 are published immediately
- User trust scores affect fraud detection sensitivity
