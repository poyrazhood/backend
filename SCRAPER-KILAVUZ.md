# Tecrubelerim.com — Scraper Kullanım Kılavuzu

## Genel Bakış

Sistem üç katmandan oluşur:

```
scraper-queue.cjs     → Job listesi yönetimi (57k job, il×ilçe×kategori)
auto-scraper.cjs      → Otomatik çalıştırıcı (navigate + snapshot + import)
maps-scraper.cjs      → Manuel snapshot → DB import
google-review-scraper → Mevcut işletmelerin yorumlarını çeker
trust-score.cjs       → TrustScore hesaplar
```

---

## Ön Koşullar

```powershell
# Docker çalışıyor olmalı
# OpenClaw gateway açık olmalı
openclaw gateway --port 18789 --allow-unconfigured

# Browser profili hazır olmalı
openclaw browser --browser-profile openclaw status
```

---

## 1. İlk Kurulum (Bir Kez)

```powershell
cd C:\Users\PC\Desktop\tecrubelerim

# Veritabanını sıfırla
npx prisma db push --accept-data-loss --force-reset

# Kategorileri ekle
node prisma/seed-categories.cjs
node prisma/seed.js

# Job kuyruğunu oluştur (57.997 job)
node memory/scraper-queue.cjs init
```

---

## 2. Otomatik Scraper (Önerilen)

### Temel Kullanım

```powershell
cd C:\Users\PC\Desktop\tecrubelerim

# 10 job çalıştır (varsayılan)
node scraper/auto-scraper.cjs run

# 50 job çalıştır
node scraper/auto-scraper.cjs run --jobs 50

# Tüm jobları çalıştır (uzun sürer!)
node scraper/auto-scraper.cjs run --jobs all
```

### Bölge Filtreli Çalıştırma

```powershell
# Sadece İstanbul
node scraper/auto-scraper.cjs run --jobs 100 --il istanbul

# Sadece Kadıköy
node scraper/auto-scraper.cjs run --jobs 20 --ilce kadikoy

# İstanbul + snapshot kaydet
node scraper/auto-scraper.cjs run --jobs 50 --il istanbul --save-snapshots
```

### Test

```powershell
# 1 job test et
node scraper/auto-scraper.cjs test
```

---

## 3. Manuel Scraper (Kontrollü)

Tek tek çalıştırmak istersen:

```powershell
# Sıradaki jobları gör
node memory/scraper-queue.cjs next 5

# Browser'da aç
openclaw browser --browser-profile openclaw navigate "https://www.google.com/maps/search/Kadıköy+kafeler"

# 4 saniye bekle, snapshot al
openclaw browser --browser-profile openclaw snapshot | Out-File -FilePath "memory\snapshots\snap.txt" -Encoding utf8

# Parse et (önce kontrol)
node memory/maps-scraper.cjs parse memory\snapshots\snap.txt

# DB'ye yaz
node memory/maps-scraper.cjs import memory\snapshots\snap.txt "Kadıköy" kafeler

# Job'u tamamlandı işaretle
node memory/scraper-queue.cjs done <job_id> <bulunan_işletme_sayısı>
```

---

## 4. Yorum Çekme

```powershell
# Durum kontrol
node scraper/google-review-scraper.cjs status

# Tüm işletmelerin yorumlarını çek
node scraper/google-review-scraper.cjs scrape --all

# Tek işletme
node scraper/google-review-scraper.cjs scrape --id <businessId>
```

---

## 5. TrustScore

```powershell
# Tüm işletmeleri hesapla
node memory/trust-score.cjs calc-all

# Tek işletme
node memory/trust-score.cjs calc --id <businessId>

# Rapor
node memory/trust-score.cjs report
```

---

## 6. Durum Takibi

```powershell
# Queue durumu
node memory/scraper-queue.cjs status

# İşletme sayısı
node list-businesses.cjs

# Yorum durumu
node scraper/google-review-scraper.cjs status
```

---

## 7. Önerilen Çalışma Akışı

### Pilot Test (Kadıköy)
```powershell
node scraper/auto-scraper.cjs run --ilce kadikoy --jobs 20
node scraper/google-review-scraper.cjs scrape --all
node memory/trust-score.cjs calc-all
node memory/trust-score.cjs report
```

### Şehir Bazlı Tarama
```powershell
# İstanbul tara
node scraper/auto-scraper.cjs run --il istanbul --jobs 500

# TrustScore güncelle
node memory/trust-score.cjs calc-all
```

### Haftalık Yorum Güncellemesi
```powershell
node scraper/google-review-scraper.cjs scrape --all
node memory/trust-score.cjs calc-all
```

---

## 8. Hız & Rate Limiting

| Mod | Hız | Günlük kapasite |
|-----|-----|-----------------|
| Yavaş (varsayılan) | ~900 job/saat | ~21.600 |
| Hızlı | ~1.800 job/saat | ~43.200 |

57.997 job için tahmini süre: **~3 gün** (kesintisiz çalışırsa)

---

## 9. Dosya Yapısı

```
tecrubelerim/
  scraper/
    auto-scraper.cjs          ← OTOMATİK ÇALIŞTIRICI
    maps-scraper.cjs          ← manuel import
    google-review-scraper.cjs ← yorum çekici
    playwright-scraper.cjs    ← gelecek: proxy + captcha
  memory/
    scraper-queue.db          ← 57k job kuyruğu
    scraper-queue.cjs         ← queue yönetimi
    trust-score.cjs           ← TrustScore motoru
    facts.db                  ← Hood'un hafızası
    snapshots/                ← kaydedilen snapshotlar
  prisma/
    schema.prisma
    seed.js
    seed-categories.cjs
```

---

## 10. Sorun Giderme

**"Boş snapshot" hatası:**
```powershell
# Browser çalışıyor mu?
openclaw browser --browser-profile openclaw status
# Çalışmıyorsa başlat:
openclaw browser --browser-profile openclaw start
```

**"Kategori bulunamadı" hatası:**
```powershell
node prisma/seed-categories.cjs
```

**Job takılı kaldı (running durumda):**
```powershell
# Direkt SQLite ile düzelt
node -e "const D=require('better-sqlite3');const d=new D('./memory/scraper-queue.db');d.prepare(\"UPDATE jobs SET status='pending' WHERE status='running'\").run();console.log('Reset edildi');d.close();"
```

**Docker bağlantı hatası:**
```
Docker Desktop'u başlat, sonra tekrar dene.
```
