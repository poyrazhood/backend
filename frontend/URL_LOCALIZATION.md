# URL Localization - Turkish Routes

## Overview

The frontend URLs have been localized to Turkish for better user experience and SEO optimization in the Turkish market.

## Route Changes

### Before (English)
```
/business/[slug]
```

### After (Turkish)
```
/isletmeler/[slug]
```

## Implementation Details

### 1. Directory Structure
```
frontend/app/
├── isletmeler/          # Renamed from "business"
│   └── [slug]/
│       └── page.tsx     # Business detail page
├── page.tsx             # Home page
└── layout.tsx           # Root layout
```

### 2. Updated Components

#### Home Page (`app/page.tsx`)
- ✅ Featured business cards now link to `/isletmeler/[slug]`
- ✅ Uses Next.js `Link` component for client-side navigation
- ✅ Example: `/isletmeler/ornek-isletme-1`

```tsx
<Link 
  href={`/isletmeler/ornek-isletme-${item}`}
  className="bg-white rounded-lg p-6 shadow-md card-hover cursor-pointer block"
>
  {/* Business card content */}
</Link>
```

#### Business Detail Page (`app/isletmeler/[slug]/page.tsx`)
- ✅ Added breadcrumb navigation with Turkish labels
- ✅ Added back button linking to home page
- ✅ Header logo links to home page
- ✅ Related businesses carousel uses `/isletmeler/[slug]` links

**Breadcrumb Structure:**
```
Ana Sayfa / İşletmeler / [Business Name]
```

**Navigation Elements:**
- Home icon + "Ana Sayfa" → `/`
- "İşletmeler" → `/isletmeler` (future listing page)
- Current business name (non-clickable)
- Back button: "Geri Dön" → `/`

### 3. Related Business Links

The "İnsanlar Bunlara da Baktı" (People also looked at) carousel now uses proper Turkish routes:

```tsx
<Link
  href={`/isletmeler/${business.slug}`}
  className="bg-white rounded-lg p-4 shadow-md min-w-[280px] card-hover cursor-pointer block"
>
  {/* Business card content */}
</Link>
```

## SEO Benefits

### Turkish URLs
- ✅ Better for Turkish search engines
- ✅ More user-friendly for Turkish speakers
- ✅ Improved click-through rates
- ✅ Clearer URL structure

### Example URLs
```
https://tecrubelerim.com/isletmeler/cicek-kebap-salonu
https://tecrubelerim.com/isletmeler/guzel-kahve-dunyasi
https://tecrubelerim.com/isletmeler/sik-restaurant-bar
```

## Future Localization

### Planned Routes
```
/isletmeler              # Business listing page
/isletmeler/[slug]       # Business detail (✅ Implemented)
/kategoriler             # Categories page
/kategoriler/[slug]      # Category detail
/hakkimizda             # About us
/iletisim               # Contact
/yardim                 # Help
```

### API Integration
When connecting to the backend API, the slug parameter remains the same:
```typescript
// Frontend route
/isletmeler/ornek-isletme

// Backend API call
GET /api/businesses/ornek-isletme
```

## Translation Reference

| English | Turkish | Route |
|---------|---------|-------|
| business | işletme | `/isletmeler` |
| businesses | işletmeler | `/isletmeler` |
| categories | kategoriler | `/kategoriler` |
| about | hakkımızda | `/hakkimizda` |
| contact | iletişim | `/iletisim` |
| help | yardım | `/yardim` |
| reviews | yorumlar | `/yorumlar` |
| home | ana sayfa | `/` |

## Testing

### Manual Testing Checklist
- [ ] Home page business cards link to `/isletmeler/[slug]`
- [ ] Business detail page loads correctly
- [ ] Breadcrumbs display proper Turkish labels
- [ ] Back button navigates to home page
- [ ] Related businesses link to `/isletmeler/[slug]`
- [ ] Header logo links to home page
- [ ] All navigation is client-side (no page refresh)

### Test URLs
```bash
# Home page
http://localhost:3000/

# Business detail pages
http://localhost:3000/isletmeler/ornek-isletme-1
http://localhost:3000/isletmeler/ornek-isletme-2
http://localhost:3000/isletmeler/benzer-isletme-1
```

## Migration Notes

### For Existing URLs
If you have existing `/business/[slug]` URLs in production, consider:

1. **301 Redirects** in `next.config.js`:
```javascript
async redirects() {
  return [
    {
      source: '/business/:slug',
      destination: '/isletmeler/:slug',
      permanent: true,
    },
  ]
}
```

2. **Canonical URLs** in page metadata:
```tsx
export const metadata = {
  alternates: {
    canonical: `/isletmeler/${slug}`,
  },
}
```

## Best Practices

1. **Consistent Naming**: Always use Turkish route names
2. **Slug Format**: Use lowercase, hyphen-separated Turkish slugs
3. **Special Characters**: Handle Turkish characters (ç, ğ, ı, ö, ş, ü) properly
4. **URL Encoding**: Ensure proper encoding for Turkish characters

### Slug Examples
```
Çiçek Kebap & Salonu  →  cicek-kebap-salonu
Güzel Kahve Dünyası   →  guzel-kahve-dunyasi
Şık Restaurant & Bar  →  sik-restaurant-bar
```

## Implementation Status

- [x] Rename `/business` directory to `/isletmeler`
- [x] Update home page links
- [x] Add breadcrumb navigation
- [x] Add back button
- [x] Update related business links
- [x] Update header navigation
- [x] Create documentation

---

**Last Updated**: 2024-02-24
**Status**: ✅ Complete
