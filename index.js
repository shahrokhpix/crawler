require('dotenv').config();
const express = require("express");
const puppeteer = require("puppeteer-core");
const fs = require('fs');
const RSS = require('rss');
const crypto = require('crypto');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cluster = require('cluster');

// Import our new modules
const Database = require('./config/database');
const Logger = require('./utils/logger');
const UniversalCrawler = require('./services/crawler');
const AuthMiddleware = require('./middleware/auth');
const cookieParser = require('cookie-parser');
const errorHandler = require('./middleware/errorHandler');
const apiRoutes = require('./routes/api');
const scheduler = require('./services/scheduler');
const cleanup = require('./services/cleanup');
const { monitor, requestCounter, healthCheckRoute } = require('./monitoring');

const app = express();
const PORT = process.env.PORT || 3004;

// Initialize components
const database = Database; // Database is already an instance
const logger = Logger; // Logger is already an instance
const crawler = new UniversalCrawler();
const auth = AuthMiddleware; // AuthMiddleware is already an instance

// Use the new database adapter for legacy compatibility
const db = database.db; // This is now the adapter that works with both SQLite and PostgreSQL

// Create legacy tables if they don't exist (for backward compatibility)
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    link TEXT UNIQUE NOT NULL,
    content TEXT,
    summary TEXT,
    published_date TEXT,
    crawled_date TEXT,
    hash TEXT UNIQUE,
    is_read BOOLEAN DEFAULT 0,
    depth INTEGER DEFAULT 0
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS crawl_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crawl_date TEXT,
    articles_found INTEGER,
    new_articles INTEGER
  )`);
  
  // Add depth column to existing articles table if it doesn't exist
  db.run(`ALTER TABLE articles ADD COLUMN depth INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column') && !err.message.includes('already exists')) {
      console.error('Error adding depth column:', err.message);
    }
  });
});

// Database is already initialized in the module
logger.info('New database system initialized successfully');

// Security and Performance Middleware
app.use(helmet({
  contentSecurityPolicy: false, // برای admin panel
  crossOriginEmbedderPolicy: false
}));

// Compression middleware
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقیقه
  max: 100, // حداکثر 100 درخواست در 15 دقیقه
  message: {
    error: 'تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً کمی صبر کنید.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting برای API
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 دقیقه
  max: 30, // حداکثر 30 درخواست در دقیقه
  message: {
    error: 'تعداد درخواست‌های API بیش از حد مجاز است.',
    retryAfter: '1 minute'
  }
});

// Rate limiting برای crawler
const crawlerLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 دقیقه
  max: 10, // حداکثر 10 درخواست crawler در 5 دقیقه
  message: {
    error: 'تعداد درخواست‌های کرال بیش از حد مجاز است.',
    retryAfter: '5 minutes'
  }
});

app.use(limiter);
app.use('/api', apiLimiter);
app.use('/api/crawler', crawlerLimiter);

// Basic Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files with caching
app.use(express.static('public', {
  maxAge: '1d', // کش 1 روزه
  etag: true,
  lastModified: true
}));

app.use('/admin', express.static(path.join(__dirname, 'public', 'admin'), {
  maxAge: '1h', // کش 1 ساعته برای admin panel
  etag: true
}));

app.use(cookieParser());

// Monitoring middleware
app.use(requestCounter);

// Health check endpoint
app.get('/health', healthCheckRoute);
app.get('/api/health', healthCheckRoute);

// API Routes - New system
app.use('/api', apiRoutes);
app.use(errorHandler);

// Load and start cron jobs
scheduler.loadSchedules();

// Admin panel route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Helper function to generate hash for article
function generateHash(title, link) {
  return crypto.createHash('md5').update(title + link).digest('hex');
}

// Helper function to extract article content and internal links
async function extractArticleContent(page, url) {
  try {
    // تنظیم زبان فارسی برای صفحه
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForTimeout(3000);
    
    const result = await page.evaluate(() => {
      // Try different selectors for article content
      const selectors = [
        'article .content',
        '.article-content',
        '.news-content',
        '.post-content',
        '[class*="content"]',
        'main p',
        '.entry-content'
      ];
      
      let content = '';
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim().length > 100) {
          content = element.textContent.trim();
          break;
        }
      }
      
      // Fallback: get all paragraphs
      if (!content) {
        const paragraphs = Array.from(document.querySelectorAll('p'));
        const text = paragraphs
          .map(p => p.textContent.trim())
          .filter(text => text.length > 20)
          .join(' ');
        
        content = text.length > 100 ? text : 'محتوای مقاله قابل استخراج نیست';
      }
      
      // Extract internal links from the article
      const internalLinks = [];
      const links = document.querySelectorAll('a[href]');
      
      links.forEach(link => {
        const href = link.getAttribute('href');
        const title = link.textContent?.trim();
        
        if (href && title && title.length > 10) {
          // Check if it's an internal farsnews link
          if (href.includes('farsnews.ir') || href.startsWith('/')) {
            const fullLink = href.startsWith('http') ? href : `https://www.farsnews.ir${href}`;
            
            // Avoid duplicate links and self-references
            if (!internalLinks.some(l => l.link === fullLink) && fullLink !== window.location.href) {
              internalLinks.push({
                title: title,
                link: fullLink
              });
            }
          }
        }
      });
      
      return {
        content: content,
        internalLinks: internalLinks.slice(0, 5) // Limit to 5 internal links per article
      };
    });
    
    return result;
  } catch (error) {
    console.log(`Error extracting content from ${url}:`, error.message);
    return {
      content: 'خطا در استخراج محتوا',
      internalLinks: []
    };
  }
}

// Helper function to crawl internal links recursively
async function crawlInternalLinks(page, links, maxDepth = 1, currentDepth = 0) {
  if (currentDepth >= maxDepth || links.length === 0) {
    return [];
  }
  
  const crawledArticles = [];
  
  for (const link of links.slice(0, 3)) { // Limit to 3 links per level
    try {
      console.log(`  Crawling internal link (depth ${currentDepth + 1}): ${link.title}`);
      
      const result = await extractArticleContent(page, link.link);
      
      const article = {
        title: link.title,
        link: link.link,
        content: result.content,
        summary: result.content.substring(0, 200) + '...',
        published_date: new Date().toISOString(),
        depth: currentDepth + 1
      };
      
      crawledArticles.push(article);
      
      // Recursively crawl deeper if there are more internal links
      if (result.internalLinks && result.internalLinks.length > 0 && currentDepth + 1 < maxDepth) {
        const deeperArticles = await crawlInternalLinks(page, result.internalLinks, maxDepth, currentDepth + 1);
        crawledArticles.push(...deeperArticles);
      }
      
    } catch (error) {
      console.error(`Error crawling internal link ${link.link}:`, error.message);
    }
  }
  
  return crawledArticles;
}

// Helper function to save article to database
function saveArticle(article) {
  return new Promise((resolve, reject) => {
    const hash = generateHash(article.title, article.link);
    
    db.get('SELECT id FROM articles WHERE hash = ?', [hash], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (row) {
        // Article already exists
        resolve({ saved: false, reason: 'exists' });
        return;
      }
      
      // Insert new article
      const stmt = db.prepare(`INSERT INTO articles 
        (title, link, content, summary, published_date, crawled_date, hash, is_read, depth) 
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`);
      
      stmt.run([
        article.title,
        article.link,
        article.content || '',
        article.summary || article.title,
        article.published_date || new Date().toISOString(),
        new Date().toISOString(),
        hash,
        article.depth || 0
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ saved: true, id: this.lastID });
        }
      });
      
      stmt.finalize();
    });
  });
}

app.get("/api/farsnews", async (req, res) => {
  try {
    const crawlWithContent = req.query.full === 'true';
    const maxArticles = parseInt(req.query.limit) || 10;
    const crawlDepth = parseInt(req.query.depth) || 0; // New parameter for crawl depth
    
    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox", 
        "--disable-web-security", 
        "--disable-features=VizDisplayCompositor",
        "--lang=fa-IR",
        "--accept-lang=fa-IR,fa,en-US,en",
        "--force-device-scale-factor=1"
      ]
    });

    const page = await browser.newPage();
    
    // تنظیم زبان فارسی برای صفحه
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    console.log('Navigating to farsnews showcase...');
    await page.goto("https://www.farsnews.ir/showcase", { 
      waitUntil: "networkidle0",
      timeout: crawlDepth > 0 ? 180000 : 60000 // Increase timeout for deep crawling
    });
    
    // Wait for content to load
    console.log('Waiting for content to load...');
    await page.waitForTimeout(10000);
    
    console.log('Extracting articles...');
    
    // Extract articles from the page
    const articles = await page.evaluate(() => {
      const results = [];
      
      // Get all links that might be news articles
      const newsLinks = document.querySelectorAll('a[href*="/news"], a[href*="/showcase"], a[href*="13"]');
      console.log(`Found ${newsLinks.length} potential news links`);
      
      newsLinks.forEach((link, index) => {
        const title = link.textContent?.trim();
        const href = link.getAttribute('href');
        
        if (title && href && title.length > 10) {
          const fullLink = href.startsWith('http') ? href : `https://www.farsnews.ir${href}`;
          
          results.push({
            title: title,
            link: fullLink,
            published_date: new Date().toISOString(),
            depth: 0 // Main articles have depth 0
          });
        }
      });
      
      return results;
    });
    
    console.log(`Found ${articles.length} articles`);
    
    let newArticlesCount = 0;
    const processedArticles = [];
    const allCrawledArticles = [];
    
    // Process each article
    for (let i = 0; i < Math.min(articles.length, maxArticles); i++) {
      const article = articles[i];
      
      try {
        let internalLinks = [];
        
        // Extract full content if requested
        if (crawlWithContent) {
          console.log(`Extracting content for: ${article.title}`);
          const result = await extractArticleContent(page, article.link);
          article.content = result.content;
          article.summary = result.content.substring(0, 200) + '...';
          internalLinks = result.internalLinks || [];
        }
        
        // Save main article to database
        const saveResult = await saveArticle(article);
        
        if (saveResult.saved) {
          newArticlesCount++;
          console.log(`✓ New article saved: ${article.title}`);
        } else {
          console.log(`- Article already exists: ${article.title}`);
        }
        
        processedArticles.push({
          ...article,
          isNew: saveResult.saved,
          id: saveResult.id,
          internalLinksFound: internalLinks.length
        });
        
        // Crawl internal links if depth > 0
        if (crawlDepth > 0 && internalLinks.length > 0) {
          console.log(`  Found ${internalLinks.length} internal links, crawling with depth ${crawlDepth}...`);
          const crawledLinks = await crawlInternalLinks(page, internalLinks, crawlDepth);
          
          // Save crawled internal articles
          for (const crawledArticle of crawledLinks) {
            try {
              const crawledSaveResult = await saveArticle(crawledArticle);
              
              if (crawledSaveResult.saved) {
                newArticlesCount++;
                console.log(`  ✓ Internal article saved (depth ${crawledArticle.depth}): ${crawledArticle.title}`);
              } else {
                console.log(`  - Internal article already exists: ${crawledArticle.title}`);
              }
              
              allCrawledArticles.push({
                ...crawledArticle,
                isNew: crawledSaveResult.saved,
                id: crawledSaveResult.id
              });
              
            } catch (error) {
              console.error(`Error saving internal article ${crawledArticle.title}:`, error.message);
            }
          }
        }
        
      } catch (error) {
        console.error(`Error processing article ${article.title}:`, error.message);
        processedArticles.push({
          ...article,
          error: error.message
        });
      }
    }
    
    // Save crawl history
    const totalArticlesProcessed = processedArticles.length + allCrawledArticles.length;
    const stmt = db.prepare('INSERT INTO crawl_history (crawl_date, articles_found, new_articles) VALUES (?, ?, ?)');
    stmt.run([new Date().toISOString(), totalArticlesProcessed, newArticlesCount]);
    stmt.finalize();
    
    await browser.close();
    
    res.json({
      success: true,
      totalFound: articles.length,
      processed: processedArticles.length,
      internalArticlesCrawled: allCrawledArticles.length,
      totalProcessed: totalArticlesProcessed,
      newArticles: newArticlesCount,
      crawlDepth: crawlDepth,
      mainArticles: processedArticles,
      internalArticles: allCrawledArticles,
      articles: [...processedArticles, ...allCrawledArticles] // Combined for backward compatibility
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to get stored articles
app.get('/api/articles', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const onlyNew = req.query.new === 'true';
  
  let query = 'SELECT * FROM articles';
  let params = [];
  
  if (onlyNew) {
    query += ' WHERE COALESCE(CASE WHEN is_read THEN 1 ELSE 0 END, 0) = 0';
  }
  
  query += ' ORDER BY crawled_date DESC LIMIT ?';
  params.push(limit);
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    res.json({
      success: true,
      count: rows.length,
      articles: rows
    });
  });
});

// API to mark articles as read (not new)
app.post('/api/articles/mark-read', (req, res) => {
  db.run('UPDATE articles SET is_read = (1=1)', (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    res.json({ success: true, message: 'All articles marked as read' });
  });
});

// API to get crawl statistics
app.get('/api/stats', (req, res) => {
  const queries = {
    totalArticles: 'SELECT COUNT(*) as count FROM articles',
    newArticles: 'SELECT COUNT(*) as count FROM articles WHERE COALESCE(CASE WHEN is_read THEN 1 ELSE 0 END, 0) = 0',
    recentCrawls: 'SELECT * FROM crawl_history ORDER BY crawl_date DESC LIMIT 10'
  };
  
  const results = {};
  let completed = 0;
  
  Object.keys(queries).forEach(key => {
    db.all(queries[key], (err, rows) => {
      if (!err) {
        results[key] = key === 'recentCrawls' ? rows : rows[0].count;
      }
      
      completed++;
      if (completed === Object.keys(queries).length) {
        res.json({
          success: true,
          stats: results
        });
      }
    });
  });
});

// RSS Feed endpoint
app.get('/rss', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  
  db.all('SELECT * FROM articles ORDER BY crawled_date DESC LIMIT ?', [limit], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const feed = new RSS({
      title: 'فارس نیوز - showcase',
      description: 'آخرین اخبار ورزشی از فارس نیوز',
      feed_url: `http://localhost:${PORT}/rss`,
      site_url: 'https://www.farsnews.ir/showcase',
      language: 'fa',
      pubDate: new Date(),
      ttl: 60
    });
    
    rows.forEach(article => {
      feed.item({
        title: article.title,
        description: article.summary || article.title,
        url: article.link,
        guid: article.hash,
        date: new Date(article.published_date),
        custom_elements: [
          { 'content:encoded': article.content || article.summary || article.title }
        ]
      });
    });
    
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(feed.xml());
  });
});

// API to get a specific article
app.get('/api/articles/:id', (req, res) => {
  const id = req.params.id;
  
  db.get('SELECT * FROM articles WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!row) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    
    res.json({
      success: true,
      article: row
    });
  });
});

app.listen(PORT, async () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
  console.log(`🔧 Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`📰 RSS Feed available at: http://localhost:${PORT}/rss`);
  console.log(`📊 API Endpoints:`);
  console.log(`   Legacy Endpoints:`);
  console.log(`   GET /api/farsnews - Crawl new articles`);
  console.log(`   GET /api/farsnews?full=true&limit=5 - Crawl with full content`);
  console.log(`   GET /api/articles - Get stored articles`);
  console.log(`   GET /api/articles?new=true - Get only new articles`);
  console.log(`   GET /api/stats - Get crawl statistics`);
  console.log(`   GET /rss - RSS feed`);
  console.log(``);
  console.log(`   New Universal Crawler API:`);
  console.log(`   POST /api/auth/login - Admin login`);
  console.log(`   GET /api/sources - Manage news sources`);
  console.log(`   POST /api/crawler/crawl - Universal crawler`);
  console.log(`   POST /api/crawler/test-selector - Test selectors`);
  console.log(`   GET /api/logs - View crawl logs`);
  console.log(``);
  console.log(`👤 Default admin: username=admin, password=admin123`);
  
  // شروع زمانبندی‌های پاک‌سازی
  await cleanup.startAllJobs();
});
