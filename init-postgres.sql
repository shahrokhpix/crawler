-- Initialize PostgreSQL database for FarsNews

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS farsnews_prod;

-- Connect to the database
\c farsnews_prod;

-- Create articles table
CREATE TABLE IF NOT EXISTS articles (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    url TEXT UNIQUE NOT NULL,
    source_id INTEGER,
    source_name VARCHAR(255),
    published_date TIMESTAMP,
    crawled_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    hash VARCHAR(64) UNIQUE,
    category VARCHAR(100),
    tags TEXT[],
    image_url TEXT,
    summary TEXT,
    word_count INTEGER,
    reading_time INTEGER,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create crawl_history table
CREATE TABLE IF NOT EXISTS crawl_history (
    id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL,
    source_name VARCHAR(255),
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'running',
    articles_found INTEGER DEFAULT 0,
    articles_saved INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    crawler_type VARCHAR(50),
    error_message TEXT,
    duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create sources table
CREATE TABLE IF NOT EXISTS sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    crawler_type VARCHAR(50) DEFAULT 'cheerio',
    selector TEXT, -- kept for backward compatibility
    is_active BOOLEAN DEFAULT true,
    crawl_interval INTEGER DEFAULT 3600, -- seconds
    last_crawl TIMESTAMP,
    next_crawl TIMESTAMP,
    total_articles INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 100.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create source_selectors table for multiple selectors per source
CREATE TABLE IF NOT EXISTS source_selectors (
    id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL,
    selector_type VARCHAR(50) NOT NULL, -- 'list', 'title', 'content', 'link', 'image', 'date', 'author'
    selector_value TEXT NOT NULL,
    selector_name VARCHAR(100), -- user-friendly name
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 1, -- for ordering
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES sources (id) ON DELETE CASCADE
);

-- Create performance_metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(10,2),
    metric_type VARCHAR(50), -- 'counter', 'gauge', 'histogram'
    instance_id VARCHAR(100),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tags JSONB
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
CREATE INDEX IF NOT EXISTS idx_articles_hash ON articles(hash);
CREATE INDEX IF NOT EXISTS idx_articles_source_id ON articles(source_id);
CREATE INDEX IF NOT EXISTS idx_articles_published_date ON articles(published_date);
CREATE INDEX IF NOT EXISTS idx_articles_crawled_date ON articles(crawled_date);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);

CREATE INDEX IF NOT EXISTS idx_crawl_history_source_id ON crawl_history(source_id);
CREATE INDEX IF NOT EXISTS idx_crawl_history_start_time ON crawl_history(start_time);
CREATE INDEX IF NOT EXISTS idx_crawl_history_status ON crawl_history(status);

CREATE INDEX IF NOT EXISTS idx_sources_is_active ON sources(is_active);
CREATE INDEX IF NOT EXISTS idx_sources_next_crawl ON sources(next_crawl);

CREATE INDEX IF NOT EXISTS idx_source_selectors_source_id ON source_selectors(source_id);
CREATE INDEX IF NOT EXISTS idx_source_selectors_type ON source_selectors(selector_type);
CREATE INDEX IF NOT EXISTS idx_source_selectors_active ON source_selectors(is_active);
CREATE INDEX IF NOT EXISTS idx_source_selectors_priority ON source_selectors(priority);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_name ON performance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_instance ON performance_metrics(instance_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON articles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sources_updated_at BEFORE UPDATE ON sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_source_selectors_updated_at BEFORE UPDATE ON source_selectors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default sources (migrated from existing data)
INSERT INTO sources (id, name, url, crawler_type, selector, is_active) VALUES
(1, 'آریا', 'https://www.aryanews.com', 'cheerio', 'a[href]', true),
(167, 'تست پلی‌رایت', 'https://example.com', 'playwright', 'a[href]', true)
ON CONFLICT (id) DO NOTHING;

-- Create view for article statistics
CREATE OR REPLACE VIEW article_stats AS
SELECT 
    s.name as source_name,
    s.id as source_id,
    COUNT(a.id) as total_articles,
    COUNT(CASE WHEN a.created_at >= CURRENT_DATE THEN 1 END) as today_articles,
    COUNT(CASE WHEN a.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_articles,
    MAX(a.crawled_date) as last_article_date,
    AVG(a.word_count) as avg_word_count
FROM sources s
LEFT JOIN articles a ON s.id = a.source_id
WHERE s.is_active = true
GROUP BY s.id, s.name;

-- Create view for crawl performance
CREATE OR REPLACE VIEW crawl_performance AS
SELECT 
    source_id,
    source_name,
    COUNT(*) as total_crawls,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_crawls,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_crawls,
    ROUND(COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*), 2) as success_rate,
    AVG(duration_seconds) as avg_duration,
    SUM(articles_saved) as total_articles_saved,
    MAX(start_time) as last_crawl
FROM crawl_history
WHERE start_time >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY source_id, source_name;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO farsnews_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO farsnews_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO farsnews_user;

-- Create user for application (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'farsnews_user') THEN
        CREATE USER farsnews_user WITH PASSWORD 'secure_password';
    END IF;
END
$$;

-- Grant permissions to user
GRANT CONNECT ON DATABASE farsnews_prod TO farsnews_user;
GRANT USAGE ON SCHEMA public TO farsnews_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO farsnews_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO farsnews_user;

COMMIT;