CREATE INDEX CONCURRENTLY idx_business_embedding_hnsw
ON "BusinessEmbedding"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
