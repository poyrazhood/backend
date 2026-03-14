# Tecrubelerim.com

> High-trust local business discovery platform built for 1M+ scale

## 🎯 Vision

A transparent, scalable platform connecting users with verified local businesses through a sophisticated Trust Score system and Local Guide badge gamification.

## 🏗️ Architecture

**Built with First Principles. Scaled with Maximum Efficiency.**

### Tech Stack
- **Backend**: Node.js + Fastify (high-performance)
- **Database**: PostgreSQL 16 (ACID compliance, JSON support)
- **Cache**: Redis 7 (sessions, hot data)
- **ORM**: Prisma (type-safe, migration-friendly)
- **Infrastructure**: Docker + Docker Compose

### Key Features
- ✅ **Trust Score System**: Multi-dimensional user reputation (0-100)
- ✅ **Local Guide Badges**: Bronze → Silver → Gold → Platinum
- ✅ **Dynamic Business Attributes**: Flexible JSON-based schema
- ✅ **High-Scale Design**: Optimized for 1M+ users
- ✅ **Zero Bloatware**: Only essential dependencies

## 🚀 Quick Start

### Prerequisites
- Node.js >= 20.0.0
- Docker & Docker Compose
- Git

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd tecrubelerim

# Install dependencies
npm install

# Start Docker containers (PostgreSQL + Redis)
docker-compose up -d

# Generate Prisma Client
npm run db:generate

# Push database schema
npm run db:push

# Start development server
npm run dev
```

### Verify Installation

```bash
# Check health endpoint
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "healthy",
#   "services": {
#     "database": "connected",
#     "redis": "connected"
#   }
# }
```

## 📊 Database Schema

### Core Models

#### User Model
- Trust Score (0-100) with history tracking
- Badge Level (None → Bronze → Silver → Gold → Platinum)
- Engagement metrics (reviews, helpful votes, followers)
- Account verification status

#### Business Model
- Dynamic attributes (JSON) for category-specific fields
- Location-based indexing (lat/lng)
- Claim status tracking
- Average rating & review count

#### Review Model
- One review per user per business
- Helpful/Not Helpful voting
- Verification badges
- Photo attachments

### Trust Score Algorithm

```
Trust Score = (
  Review Quality × 0.4 +
  Verification Status × 0.3 +
  Community Engagement × 0.2 +
  Historical Accuracy × 0.1
) × 100
```

### Badge Requirements

| Badge | Requirements |
|-------|-------------|
| 🥉 Bronze | 10+ quality reviews |
| 🥈 Silver | 50+ reviews + 80% helpful rating |
| 🥇 Gold | 200+ reviews + 90% helpful + verified identity |
| 💎 Platinum | 500+ reviews + moderator status |

## 🛠️ Development

### Available Scripts

```bash
npm run dev          # Start dev server with hot reload
npm start            # Start production server
npm run db:generate  # Generate Prisma Client
npm run db:push      # Push schema to database
npm run db:migrate   # Create migration
npm run db:studio    # Open Prisma Studio (GUI)
npm run db:seed      # Seed database (coming soon)
```

### Environment Variables

Copy `.env` and configure:

```env
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."
NODE_ENV="development"
PORT=3000
JWT_SECRET="your-secret-here"
```

## 📈 Scale Targets

| Metric | Target |
|--------|--------|
| Users | 1,000,000+ |
| Businesses | 100,000+ |
| Reviews/Day | 10,000+ |
| API Response Time | <100ms (p95) |
| Uptime | 99.9% |

## 🔒 Security

- Input validation on all endpoints
- Rate limiting (100 req/15min default)
- SQL injection prevention (Prisma ORM)
- Password hashing (bcrypt)
- JWT-based authentication
- CORS configuration

## 📝 API Documentation

Coming soon: Swagger/OpenAPI documentation

### Current Endpoints

- `GET /` - API information
- `GET /health` - Health check

## 🤝 Contributing

This is a private project. Contact the founder for collaboration opportunities.

## 📄 License

UNLICENSED - Private & Proprietary

---

**Built by Master Persona (Altman/Musk Hybrid CTO)**  
*Maximum Efficiency. Zero Bloatware. First Principles.*
