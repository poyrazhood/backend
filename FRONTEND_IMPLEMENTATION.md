# Frontend Implementation Guide

## 🎯 Overview

This document describes the complete frontend implementation for Tecrubelerim, including the trust system integration and sticky sidebar architecture.

## ✅ Backend Implementation (Completed)

### 1. User Service (`src/services/userService.js`)

**Trust Score System:**
- ✅ `updateTrustScore()` - Updates user trust score based on actions
  - `review_published`: +5 points
  - `helpful_vote`: +2 points
  - `verified`: +10 points
  - `review_removed`: -3 points
  - `spam_detected`: -10 points
- ✅ Score range: 0-100
- ✅ Automatic trust level calculation (NEWCOMER → DEVELOPING → TRUSTED → HIGHLY_TRUSTED → VERIFIED)

**Badge System:**
- ✅ `calculateBadgeLevel()` - Calculates and updates user badge
  - **BRONZE**: 5+ reviews
  - **SILVER**: 20+ reviews, 80%+ helpful votes
  - **GOLD**: 50+ reviews, 90%+ helpful votes, verified account
  - **PLATINUM**: 500+ reviews (moderator candidate)
- ✅ Automatic badge progression tracking
- ✅ Helpful vote percentage calculation

**User Profile:**
- ✅ `getUserProfile()` - Returns complete user profile with trust metrics

### 2. Review Routes (`src/routes/reviewRoutes.js`)

**Trust Score Integration:**
- ✅ POST `/reviews` - Triggers trust score update when review is published
- ✅ POST `/reviews/:reviewId/helpful` - Updates trust score on helpful votes
- ✅ Only published reviews trigger trust score updates
- ✅ Badge level recalculation after score changes
- ✅ Error handling with graceful degradation

**Fraud Detection:**
- ✅ Automatic fraud detection on review submission
- ✅ Reviews flagged or quarantined based on fraud score
- ✅ No trust score update for unpublished/quarantined reviews

### 3. Auth Routes (`src/routes/authRoutes.js`)

**Profile Endpoint:**
- ✅ GET `/auth/me` - Returns current user with trust score and badge level
- ✅ Includes complete profile statistics
- ✅ Helpful vote percentage calculation
- ✅ Verification status

## 🎨 Frontend Implementation (Completed)

### Architecture: Next.js 15 App Router

**Project Structure:**
```
frontend/
├── app/
│   ├── business/[slug]/page.tsx   # Business detail with sticky layout
│   ├── globals.css                 # Global styles + custom utilities
│   ├── layout.tsx                  # Root layout
│   └── page.tsx                    # Home page
├── components/
│   ├── StarRating.tsx              # Reusable star rating component
│   └── BusinessCard.tsx            # Business card component
├── tailwind.config.ts              # Theme configuration
├── tsconfig.json                   # TypeScript config
└── package.json                    # Dependencies
```

### Design System

**Colors:**
- Primary (Trust Green): `#00b67a`
- Secondary (Dark): `#191919`
- Background: `#f7f7f7`

**Typography:**
- Sans-serif font stack
- Bold headings
- Clean, readable body text

### Key Features

#### 1. Home Page (`app/page.tsx`)
- ✅ Hero section with large heading
- ✅ Centered search bar with shadow and rounded borders
- ✅ Featured business cards grid (4 columns)
- ✅ Category grid with hover effects
- ✅ 4-column footer layout

#### 2. Business Detail Page (`app/business/[slug]/page.tsx`)

**Sticky Sidebar Architecture:**

**Top Section (2-Column Grid):**
- Left (8/12): Business information
- Right (4/12): **STICKY** Rating card with "Write a review" button
  ```css
  .sticky-sidebar {
    position: sticky;
    top: 1rem;
    align-self: start;
  }
  ```

**Middle Section (Full Width):**
- Horizontal scroll carousel: "People also looked at"
- Smooth scrolling with custom scrollbar
- Card hover effects

**Bottom Section (Flipped Grid):**
- Left (4/12): **STICKY** Review statistics and rating distribution
- Right (8/12): Review feed with filters
- Grid order flips on mobile

**Responsive Behavior:**
```css
@media (max-width: 768px) {
  .sticky-sidebar {
    position: relative;
    top: 0;
  }
}
```

#### 3. Star Rating Component (`components/StarRating.tsx`)

**Features:**
- ✅ Custom green square stars (Trustpilot style)
- ✅ SVG clip-path for star shape
- ✅ Half-star support
- ✅ Three sizes: sm, md, lg
- ✅ Optional rating number display

**Usage:**
```tsx
<StarRating 
  rating={4.9} 
  size="md" 
  showNumber={true} 
/>
```

**Implementation:**
```css
clip-path: polygon(
  50% 0%, 61% 35%, 98% 35%, 68% 57%, 
  79% 91%, 50% 70%, 21% 91%, 32% 57%, 
  2% 35%, 39% 35%
);
```

#### 4. Global Styles (`app/globals.css`)

**Custom Utilities:**
- ✅ `.sticky-sidebar` - Sticky positioning
- ✅ `.horizontal-scroll` - Smooth horizontal scrolling
- ✅ `.card-hover` - Card hover effects
- ✅ Badge styles (bronze, silver, gold, platinum, verified)
- ✅ Custom scrollbar styling
- ✅ Star rating utilities

### Responsive Design

**Breakpoints:**
- Mobile: < 768px (single column, no sticky)
- Tablet: 768px - 1024px (adjusted columns)
- Desktop: > 1024px (full grid layout)

**Mobile Optimizations:**
- Sticky sidebars become relative
- Grid columns stack vertically
- Horizontal scroll maintained
- Touch-friendly interactions

## 🚀 Installation & Setup

### Backend (Already Running)
```bash
cd tecrubelerim
npm install
npx prisma generate
npm run dev
```

### Frontend (New Setup)
```bash
cd tecrubelerim/frontend
npm install
npm run dev
```

Frontend will run on: `http://localhost:3000`
Backend API runs on: `http://localhost:3000/api`

## 🔗 API Integration Points

### User Profile
```typescript
GET /api/auth/me
Response: {
  user: {
    id, username, email,
    trustScore, trustLevel, badgeLevel,
    totalReviews, helpfulVotes,
    stats: { helpfulPercentage, isVerified }
  }
}
```

### Business Details
```typescript
GET /api/businesses/:slug
Response: {
  business: { id, name, slug, rating, totalReviews, ... }
}
```

### Reviews
```typescript
GET /api/reviews/business/:businessId
POST /api/reviews
POST /api/reviews/:reviewId/helpful
```

## 📊 Trust System Flow

1. **User writes review** → POST `/api/reviews`
2. **Fraud detection runs** → Review published or quarantined
3. **If published** → `updateTrustScore(userId, 'review_published')`
4. **Trust score updated** → +5 points
5. **Badge recalculated** → `calculateBadgeLevel(userId)`
6. **User profile updated** → New badge if threshold reached

7. **Another user marks helpful** → POST `/api/reviews/:id/helpful`
8. **Review author gets** → +2 trust score points
9. **Badge recalculated** → Helpful percentage updated

## 🎯 Key Implementation Details

### Sticky Sidebar Logic
- Uses CSS `position: sticky` with `top: 1rem`
- `align-self: start` ensures proper alignment
- Automatically unsticks on mobile via media query
- Two separate sticky sections (top-right, bottom-left)

### Star Rating Calculation
```typescript
const fullStars = Math.floor(rating);
const hasHalfStar = rating % 1 >= 0.5;
```

### Badge Color Mapping
```typescript
const getBadgeColor = (badge: string) => {
  switch (badge) {
    case 'GOLD': return 'badge-gold';
    case 'SILVER': return 'badge-silver';
    case 'BRONZE': return 'badge-bronze';
    case 'PLATINUM': return 'badge-platinum';
    default: return 'bg-gray-200';
  }
};
```

## 🔧 Configuration Files

### Tailwind Config (`tailwind.config.ts`)
- Custom color palette with primary green shades
- Extended theme with trust system colors
- Responsive breakpoints

### TypeScript Config (`tsconfig.json`)
- Strict mode enabled
- Path aliases: `@/*` → `./`
- Next.js plugin integration

### Next.js Config (`next.config.js`)
- React strict mode
- Image domain configuration
- Production optimizations

## 📝 Code Standards

- **Language**: English for code, Turkish for UI
- **Style**: TypeScript strict mode
- **CSS**: Tailwind utility-first approach
- **Components**: Functional components with TypeScript
- **State**: React hooks (useState, useEffect)

## 🎨 Design Patterns

### Component Composition
```tsx
<BusinessCard>
  <StarRating />
  <Badge />
</BusinessCard>
```

### Responsive Grid
```tsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
  <div className="lg:col-span-8">Main Content</div>
  <div className="lg:col-span-4">Sidebar</div>
</div>
```

### Sticky Positioning
```tsx
<div className="sticky-sidebar">
  <div className="bg-white rounded-lg p-6">
    Sticky Content
  </div>
</div>
```

## ✅ Completed Features

### Backend
- [x] Trust score calculation and updates
- [x] Badge level system
- [x] Review trust score integration
- [x] Helpful vote trust score integration
- [x] User profile endpoint with trust metrics
- [x] Fraud detection integration

### Frontend
- [x] Next.js 15 setup with App Router
- [x] Tailwind CSS configuration
- [x] Global styles and theme
- [x] Home page with hero and search
- [x] Business detail page
- [x] Sticky sidebar architecture (dual sticky)
- [x] Star rating component
- [x] Business card component
- [x] Horizontal scroll carousel
- [x] Responsive design (mobile, tablet, desktop)
- [x] Badge display system
- [x] Review feed with filters

## 🚀 Next Steps

1. **Install Frontend Dependencies:**
   ```bash
   cd tecrubelerim/frontend
   npm install
   ```

2. **Run Development Server:**
   ```bash
   npm run dev
   ```

3. **Connect to Backend API:**
   - Create `.env.local` with API URL
   - Implement API client functions
   - Add authentication context

4. **Future Enhancements:**
   - Search functionality
   - User authentication UI
   - Review submission form
   - Image uploads
   - Real-time updates
   - PWA support

## 📄 Documentation

- Backend API: See `API_TESTING.md`
- Frontend: See `frontend/README.md`
- Setup: See `SETUP_GUIDE.md`
- Strategic: See `STRATEGIC_INTELLIGENCE.md`

---

**Implementation Status**: ✅ Complete
**Last Updated**: 2024-02-23
**Version**: 1.0.0
