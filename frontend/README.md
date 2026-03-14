# Tecrubelerim Frontend

Modern, responsive frontend for Tecrubelerim - Turkey's trusted business review platform.

## 🎨 Design System

### Colors
- **Primary (Trust Green)**: `#00b67a` - Main brand color
- **Secondary (Dark)**: `#191919` - Text and headers
- **Background**: `#f7f7f7` - Page background

### Typography
- Sans-serif font stack
- Bold headings for emphasis
- Clean, readable body text

## 🏗️ Architecture

### Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Language**: TypeScript

### Key Features

#### 1. Sticky Sidebar Layout
The business detail page uses an innovative dual-sticky layout:
- **Top Section**: Right sidebar (rating card) is sticky
- **Bottom Section**: Left sidebar (review stats) is sticky
- Automatically unsticks on mobile (<768px)

#### 2. Horizontal Scroll Carousel
Full-width "People also looked at" section with smooth scrolling

#### 3. Star Rating System
Custom green square star rating component matching Trustpilot style

#### 4. Responsive Design
- Desktop: Multi-column grid layouts
- Tablet: Adjusted columns
- Mobile: Stacked single-column layout

## 📁 Project Structure

```
frontend/
├── app/
│   ├── business/
│   │   └── [slug]/
│   │       └── page.tsx          # Business detail page
│   ├── globals.css                # Global styles & utilities
│   ├── layout.tsx                 # Root layout
│   └── page.tsx                   # Home page
├── components/
│   ├── StarRating.tsx             # Reusable star rating
│   └── BusinessCard.tsx           # Business card component
├── public/                        # Static assets
├── next.config.js                 # Next.js configuration
├── tailwind.config.ts             # Tailwind configuration
├── tsconfig.json                  # TypeScript configuration
└── package.json                   # Dependencies
```

## 🚀 Getting Started

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Build for Production

```bash
npm run build
npm start
```

## 🎯 Key Components

### StarRating Component
```tsx
<StarRating 
  rating={4.9} 
  size="md" 
  showNumber={true} 
/>
```

Props:
- `rating`: Number (0-5)
- `size`: 'sm' | 'md' | 'lg'
- `showNumber`: boolean (optional)

### BusinessCard Component
```tsx
<BusinessCard
  id="1"
  name="Business Name"
  slug="business-slug"
  rating={4.9}
  totalReviews={1234}
  isVerified={true}
  category="Technology"
/>
```

## 🎨 Custom CSS Classes

### Sticky Sidebar
```css
.sticky-sidebar {
  position: sticky;
  top: 1rem;
  align-self: start;
}
```

### Horizontal Scroll
```css
.horizontal-scroll {
  display: flex;
  overflow-x: auto;
  scroll-behavior: smooth;
}
```

### Badge Styles
- `.badge-bronze` - Bronze badge
- `.badge-silver` - Silver badge
- `.badge-gold` - Gold badge
- `.badge-platinum` - Platinum badge
- `.badge-verified` - Verified badge

## 📱 Responsive Breakpoints

- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

## 🔗 API Integration

The frontend is designed to connect to the backend API at:
- Development: `http://localhost:3000/api`
- Production: Configure via environment variables

### Environment Variables
Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

## 📝 Code Style

- **English**: Code, variable names, comments
- **Turkish**: UI text, user-facing content
- **TypeScript**: Strict mode enabled
- **Tailwind**: Utility-first CSS approach

## 🎯 Future Enhancements

- [ ] Search functionality with autocomplete
- [ ] User authentication UI
- [ ] Review submission form
- [ ] Image upload for reviews
- [ ] Advanced filtering and sorting
- [ ] Infinite scroll for reviews
- [ ] Real-time updates with WebSockets
- [ ] PWA support
- [ ] Dark mode

## 📄 License

Copyright © 2024 Tecrubelerim. All rights reserved.
