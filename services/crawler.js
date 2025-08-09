const { createCrawler } = require('./crawler-factory');
const database = require('../config/database');
const logger = require('../utils/logger');
const crypto = require('crypto');

class UniversalCrawler {
  constructor() {
    this.browser = null;
    this.pagePool = [];
    this.maxConcurrentPages = 5;
  }

  async initBrowser() {
    if (!this.browser) {
      const chromePath = Launcher.getInstallations()[0];
      this.browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--lang=fa-IR',
          '--accept-lang=fa-IR,fa,en-US,en',
          '--force-device-scale-factor=1',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-field-trial-config',
          '--disable-ipc-flooding-protection'
        ]
      });
    }
    return this.browser;
  }

  // Page pooling for better performance
  async getOrCreatePage() {
    if (this.pagePool.length > 0) {
      return this.pagePool.pop();
    }
    
    const browser = await this.initBrowser();
    const page = await browser.newPage();
    await this.setupPageOptimizations(page);
    return page;
  }

  async releasePage(page) {
    if (this.pagePool.length < this.maxConcurrentPages) {
      try {
        // Reset page for reuse
        await page.goto('about:blank');
        this.pagePool.push(page);
      } catch (error) {
        logger.warn('خطا در بازیافت صفحه:', error.message);
        await page.close();
      }
    } else {
      await page.close();
    }
  }

  async setupPageOptimizations(page) {
    // تنظیمات timeout برای سرعت
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(60000);
    
    // بلاک کردن منابع غیرضروری
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // تنظیم زبان فارسی
    await this.setupPersianLanguage(page);
  }

  async closeBrowser() {
    // بستن تمام صفحات pool
    for (const page of this.pagePool) {
      try {
        await page.close();
      } catch (error) {
        logger.warn('خطا در بستن صفحه pool:', error.message);
      }
    }
    this.pagePool = [];
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // Force close browser for fresh start
  async forceCloseBrowser() {
    // بستن تمام صفحات pool
    for (const page of this.pagePool) {
      try {
        await page.close();
      } catch (error) {
        logger.warn('خطا در بستن صفحه pool:', error.message);
      }
    }
    this.pagePool = [];
    
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        logger.warn('خطا در بستن مرورگر:', error.message);
      }
      this.browser = null;
    }
  }

  generateHash(title, link) {
    return crypto.createHash('md5').update(title + link).digest('hex');
  }

  // تابع کمکی برای تنظیم زبان فارسی در صفحه
  async setupPersianLanguage(page) {
    try {
      // تنظیم HTTP Headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      });
      
      // تنظیم User Agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // تنظیم Viewport
      await page.setViewport({ width: 1920, height: 1080 });
      
      // تنظیم زبان در context برای صفحات جدید
      await page.evaluateOnNewDocument(() => {
        try {
          Object.defineProperty(navigator, 'language', {
            get: () => 'fa-IR',
          });
          Object.defineProperty(navigator, 'languages', {
            get: () => ['fa-IR', 'fa', 'en-US', 'en'],
          });
          
          // تنظیم document.documentElement.lang
          if (document.documentElement) {
            document.documentElement.lang = 'fa-IR';
          }
          
          // تنظیم localStorage و sessionStorage
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('locale', 'fa-IR');
            localStorage.setItem('lang', 'fa');
          }
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('locale', 'fa-IR');
            sessionStorage.setItem('lang', 'fa');
          }
        } catch (e) {
          // اگر property قبلاً تعریف شده، نادیده بگیر
        }
      });
      
      // تنظیم زبان برای صفحه فعلی
      await page.evaluate(() => {
        try {
          // تنظیم navigator properties
          Object.defineProperty(navigator, 'language', {
            get: () => 'fa-IR',
          });
          Object.defineProperty(navigator, 'languages', {
            get: () => ['fa-IR', 'fa', 'en-US', 'en'],
          });
          
          // تنظیم document.documentElement.lang
          if (document.documentElement) {
            document.documentElement.lang = 'fa-IR';
          }
          
          // تنظیم localStorage و sessionStorage
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('locale', 'fa-IR');
            localStorage.setItem('lang', 'fa');
          }
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('locale', 'fa-IR');
            sessionStorage.setItem('lang', 'fa');
          }
        } catch (e) {
          // اگر property قبلاً تعریف شده، نادیده بگیر
        }
      });
      
      logger.info('تنظیمات زبان فارسی اعمال شد');
    } catch (error) {
      logger.warn('خطا در تنظیم زبان فارسی:', error.message);
    }
  }

  // اعتبارسنجی تنظیمات کرال
  validateCrawlOptions(options = {}) {
    const {
      limit = 10,
      crawlDepth = 0,
      waitTime = 3000,
      timeout = 180000,
      navigationTimeout = 120000
    } = options;

    const errors = [];

    // اعتبارسنجی تعداد اخبار
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      errors.push('تعداد اخبار باید بین 1 تا 100 باشد');
    }

    // اعتبارسنجی عمق کرال
    if (typeof crawlDepth !== 'number' || crawlDepth < 0 || crawlDepth > 5) {
      errors.push('عمق کرال باید بین 0 تا 5 باشد');
    }

    // اعتبارسنجی زمان انتظار
    if (typeof waitTime !== 'number' || waitTime < 1000 || waitTime > 30000) {
      errors.push('زمان انتظار باید بین 1000 تا 30000 میلی‌ثانیه باشد');
    }

    // اعتبارسنجی timeout
    if (typeof timeout !== 'number' || timeout < 30000 || timeout > 900000) {
      errors.push('Timeout باید بین 30000 تا 900000 میلی‌ثانیه باشد');
    }

    // اعتبارسنجی navigation timeout
    if (typeof navigationTimeout !== 'number' || navigationTimeout < 30000 || navigationTimeout > 900000) {
      errors.push('Navigation timeout باید بین 30000 تا 900000 میلی‌ثانیه باشد');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // تنظیمات پیش‌فرض برای کرال
  getDefaultCrawlOptions() {
    return {
      limit: 10,                    // تعداد اخبار
      crawlDepth: 0,               // عمق کرال
      fullContent: true,           // استخراج محتوای کامل
      waitTime: 3000,              // زمان انتظار (میلی‌ثانیه) - کاهش یافت برای سرعت
      timeout: 60000,              // timeout کلی (میلی‌ثانیه) - کاهش یافت
      navigationTimeout: 60000,    // timeout ناوبری (میلی‌ثانیه) - کاهش یافت
      followLinks: true            // دنبال کردن لینک‌ها
    };
  }

  // تنظیمات پیش‌فرض برای تست سلکتور
  getDefaultTestOptions() {
    return {
      waitTime: 3000,              // زمان انتظار (میلی‌ثانیه)
      timeout: 20000,              // timeout ناوبری (میلی‌ثانیه)
      defaultTimeout: 15000,       // timeout پیش‌فرض (میلی‌ثانیه)
      readyStateTimeout: 5000      // timeout برای readyState (میلی‌ثانیه)
    };
  }

  async saveArticle(sourceId, article) {
    const db = database.db;
    const hash = this.generateHash(article.title, article.link);

    try {
      // Check if article already exists by hash or link
      const existingArticle = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM articles WHERE hash = ? OR link = ?', [hash, article.link], (err, row) => {
          if (err) reject(err);
          resolve(row);
        });
      });

      if (existingArticle) {
        logger.info(`مقاله قبلاً وجود دارد: ${article.title}`);
        return { id: existingArticle.id, isNew: false };
      }

      // Insert or ignore to avoid duplicate errors; adapter will translate for PostgreSQL
      const result = await new Promise((resolve, reject) => {
        const query = `
          INSERT OR IGNORE INTO articles (source_id, title, link, content, hash, depth)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        db.run(query, [
          sourceId, 
          article.title, 
          article.link, 
          article.content || '', 
          hash, 
          article.depth || 0
        ], function(err) {
          if (err) {
            reject(err);
          } else {
            const hasChanges = typeof this.changes === 'number' ? this.changes > 0 : (this.lastID !== undefined && this.lastID !== null);
            const id = hasChanges ? this.lastID : (existingArticle ? existingArticle.id : null);
            resolve({ id, isNew: hasChanges });
          }
        });
      });

      if (result.isNew) {
        logger.info(`مقاله جدید ذخیره شد: ${article.title}`);
      } else {
        logger.info(`ذخیره نادیده گرفته شد (تکراری): ${article.title}`);
      }
      return result;

    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed') || 
          error.message.includes('duplicate key') ||
          error.message.includes('violates unique constraint')) {
        logger.info(`مقاله قبلاً وجود دارد (خطای uniq): ${article.title}`);
        return { id: null, isNew: false };
      }
      logger.error(`خطا در ذخیره مقاله: ${error.message}`);
      throw error;
    }
  }

  async extractArticleContent(page, url, selectors, options = {}) {
    const { 
      waitTime = 3000, 
      timeout = 60000 
    } = options;
    
    try {
      // Fast navigation strategy
      try {
        await page.goto(url, { 
          waitUntil: 'domcontentloaded', 
          timeout: timeout 
        });
      } catch (navError) {
        logger.warn(`Navigation failed for ${url}, trying load strategy`);
        await page.goto(url, { 
          waitUntil: 'load', 
          timeout: timeout 
        });
      }
      
      // Reduced wait time for speed
      await page.waitForTimeout(Math.min(waitTime, 2000));
      
      // استخراج عنوان
      let title = '';
      if (selectors.title_selector) {
        title = await page.evaluate((selector) => {
          const element = document.querySelector(selector);
          if (element) {
            return element.textContent.trim();
          } else {
            // تلاش برای یافتن عنوان با سلکتورهای جایگزین
            const alternativeSelectors = ['h1', 'h2', '.title', '.headline', '[class*="title"]', '[class*="headline"]'];
            for (const altSelector of alternativeSelectors) {
              const altElement = document.querySelector(altSelector);
              if (altElement && altElement.textContent.trim().length > 10) {
                return altElement.textContent.trim();
              }
            }
          }
          return '';
        }, selectors.title_selector);
      }
      
      // استخراج محتوا
      let content = '';
      if (selectors.content_selector) {
        content = await page.evaluate((selector) => {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements).map(el => el.textContent.trim()).join('\n');
        }, selectors.content_selector);
      }
      
      // استخراج لینک‌های داخلی - محدود برای سرعت
      const internalLinks = await page.evaluate((baseUrl, linkSelector) => {
        const links = [];
        const elements = document.querySelectorAll(linkSelector || 'a');
        
        elements.forEach(el => {
          const href = el.href;
          if (href && href.includes(baseUrl) && !href.includes('#') && !href.includes('javascript:')) {
            links.push({
              url: href,
              text: el.textContent.trim()
            });
          }
        });
        
        return links.slice(0, 3); // حداکثر 3 لینک برای سرعت
      }, new URL(url).origin, selectors.link_selector);
      
      return {
        title: title || 'بدون عنوان',
        content,
        internalLinks
      };
      
    } catch (error) {
      logger.error(`خطا در استخراج محتوا از ${url}:`, error);
      return {
        title: 'خطا در استخراج',
        content: '',
        internalLinks: []
      };
    }
  }

  // Parallel processing for internal links
  async crawlInternalLinks(page, links, sourceId, selectors, currentDepth, maxDepth) {
    if (currentDepth >= maxDepth || links.length === 0) {
      return [];
    }
    
    const results = [];
    const linksToProcess = links.slice(0, 2); // حداکثر 2 لینک در هر سطح برای سرعت
    
    // Process links in parallel chunks
    const chunkSize = 2;
    for (let i = 0; i < linksToProcess.length; i += chunkSize) {
      const chunk = linksToProcess.slice(i, i + chunkSize);
      const chunkPromises = chunk.map(async (linkInfo) => {
        const dedicatedPage = await this.getOrCreatePage();
        try {
          logger.info(`کرال لینک داخلی (عمق ${currentDepth + 1}): ${linkInfo.url}`);
          
          const articleData = await this.extractArticleContent(dedicatedPage, linkInfo.url, selectors, {
            waitTime: 2000,
            timeout: 60000
          });
          
          const article = {
            title: articleData.title,
            link: linkInfo.url,
            content: articleData.content,
            depth: currentDepth + 1
          };
          
          const saveResult = await this.saveArticle(sourceId, article);
          
          if (saveResult.isNew) {
            return article;
          }
          return null;
          
        } catch (error) {
          logger.error(`خطا در کرال لینک داخلی ${linkInfo.url}:`, error);
          return null;
        } finally {
          await this.releasePage(dedicatedPage);
        }
      });
      
      const chunkResults = await Promise.allSettled(chunkPromises);
      results.push(...chunkResults
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value)
      );
    }
    
    return results;
  }

  async crawlSource(sourceId, options = {}) {
    const startTime = Date.now();
    const { 
      limit = 10,                    // تعداد اخبار (از ورودی کاربر)
      crawlDepth = 0,               // عمق کرال (از ورودی کاربر)
      fullContent = true,           // استخراج محتوای کامل (از ورودی کاربر)
      waitTime = 3000,              // زمان انتظار (از ورودی کاربر)
      timeout = 60000,              // timeout کلی (از ورودی کاربر)
      navigationTimeout = 60000,    // timeout ناوبری (از ورودی کاربر)
      followLinks = true            // دنبال کردن لینک‌ها (از ورودی کاربر)
    } = options;
    
    // اعتبارسنجی تنظیمات
    const validation = this.validateCrawlOptions(options);
    if (!validation.isValid) {
      return {
        success: false,
        error: 'تنظیمات نامعتبر: ' + validation.errors.join(', '),
        source: sourceId
      };
    }
    
    try {
      // دریافت اطلاعات منبع
      const source = await this.getSource(sourceId);
      if (!source) {
        throw new Error(`منبع خبری با شناسه ${sourceId} یافت نشد`);
      }
      
      logger.info(`شروع کرال منبع: ${source.name} با ${source.crawler_type || 'puppeteer'}`);
      
      // ثبت شروع کرال در دیتابیس
      await logger.logCrawlOperation(sourceId, 'start', 'running', `شروع کرال منبع ${source.name}`);
      
      // ایجاد crawler مناسب بر اساس نوع انتخاب شده
      const crawler = createCrawler(source);
      
      try {
        // استفاده از crawler انتخاب شده برای استخراج اخبار
        const articles = await crawler.crawl({
          limit: limit,
          fullContent: fullContent
        });
        
        logger.info(`${articles.length} مقاله استخراج شد`);
        
        const mainArticles = [];
        const internalArticles = [];
        let newArticlesCount = 0;
        
        // ذخیره مقالات در دیتابیس
        for (const article of articles) {
          const saveResult = await this.saveArticle(sourceId, article);
          
          if (saveResult.isNew) {
            newArticlesCount++;
            mainArticles.push(article);
          }
        }
        
        // بستن crawler
        await crawler.close();
        
        const endTime = Date.now();
        const duration = Math.round((endTime - startTime) / 1000);
        
        logger.info(`کرال منبع ${source.name} تکمیل شد. ${newArticlesCount} مقاله جدید در ${duration} ثانیه`);
        
        // ثبت اتمام موفق کرال در دیتابیس
        await logger.logCrawlOperation(sourceId, 'crawl', 'success', 
          `کرال منبع ${source.name} تکمیل شد`, 
          {
            articlesFound: articles.length,
            articlesProcessed: newArticlesCount,
            duration: duration * 1000
          }
        );
        
        // ثبت آمار کرال در جدول تاریخچه
        await this.logCrawlHistory(sourceId, {
          totalFound: articles.length,
          totalProcessed: articles.length,
          newArticles: newArticlesCount,
          crawlDepth: crawlDepth,
          duration: duration * 1000
        });
        
        return {
          success: true,
          source: source.name,
          sourceId: sourceId,
          crawlerType: source.crawler_type || 'puppeteer',
          totalArticles: mainArticles.length,
          newArticles: newArticlesCount,
          internalArticles: internalArticles.length,
          duration: duration,
          articles: mainArticles.slice(0, 5) // نمایش 5 مقاله اول
        };
        
      } catch (crawlerError) {
        logger.error(`خطا در crawler ${source.crawler_type || 'puppeteer'}:`, crawlerError);
        await crawler.close();
        throw crawlerError;
      }
      
    } catch (error) {
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);
      
      logger.error(`خطا در کرال منبع ${sourceId}:`, error);
      
      // ثبت خطا در دیتابیس
      try {
        await logger.logCrawlOperation(sourceId, 'crawl', 'error', 
          `خطا در کرال: ${error.message}`, 
          {
            duration: duration * 1000
          }
        );
      } catch (logError) {
        logger.error('خطا در ثبت لاگ:', logError);
      }
      
      return {
        success: false,
        error: error.message,
        source: sourceId,
        duration: duration
      };
    }
  }

  async getSource(sourceId) {
    const db = database.db;
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM news_sources WHERE id = ? AND active = true';
      
      db.get(query, [sourceId], (err, row) => {
        if (err) {
          logger.error(`Error getting source ${sourceId}:`, err);
          return reject(err);
        }
        resolve(row);
      });
    });
  }

  async logCrawlHistory(sourceId, stats) {
    const db = database.db;
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO crawl_history 
        (source_id, total_found, total_processed, new_articles, crawl_depth, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      db.run(query, [
        sourceId,
        stats.totalFound,
        stats.totalProcessed,
        stats.newArticles,
        stats.crawlDepth,
        stats.duration
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  // تست سلکتور - نسخه حرفه‌ای با مدیریت خطای پیشرفته
  async testSelector(url, selector, type = 'list', options = {}) {
    const {
      waitTime = 3000,              // زمان انتظار (از ورودی کاربر)
      timeout = 20000,              // timeout ناوبری (از ورودی کاربر)
      defaultTimeout = 15000,       // timeout پیش‌فرض (از ورودی کاربر)
      readyStateTimeout = 5000      // timeout برای readyState (از ورودی کاربر)
    } = options;
    
    let page = null;
    const startTime = Date.now();
    
    try {
      // اعتبارسنجی تنظیمات timeout
      if (timeout < 5000 || timeout > 120000) {
        throw new Error('Timeout باید بین 5000 تا 120000 میلی‌ثانیه باشد');
      }
      
      if (waitTime < 1000 || waitTime > 30000) {
        throw new Error('زمان انتظار باید بین 1000 تا 30000 میلی‌ثانیه باشد');
      }
      
      // اعتبارسنجی ورودی
      if (!url || !selector) {
        throw new Error('URL و سلکتور الزامی هستند');
      }
      
      // بررسی فرمت URL
      try {
        new URL(url);
      } catch {
        throw new Error('فرمت URL نامعتبر است');
      }
      
      logger.info(`شروع تست سلکتور: ${selector} در ${url}`);
      
      // استفاده از page pooling برای بهبود عملکرد
      page = await this.getOrCreatePage();
      
      // تنظیمات اضافی برای تست
      page.setDefaultTimeout(defaultTimeout);
      page.setDefaultNavigationTimeout(timeout);
      
      // رفتن به صفحه با استراتژی چندمرحله‌ای
      try {
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: timeout 
        });
      } catch (navError) {
        await page.goto(url, { 
          waitUntil: 'load',
          timeout: timeout 
        });
      }
      
      // انتظار اضافی برای بارگذاری کامل محتوا
      try {
        await page.waitForTimeout(waitTime);
        // تلاش برای انتظار تا عناصر بارگذاری شوند
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: readyStateTimeout });
      } catch (waitError) {
        logger.warn('انتظار برای بارگذاری کامل صفحه با خطا مواجه شد، ادامه می‌دهیم...');
      }
      
      // بررسی وجود سلکتور
      const selectorExists = await page.evaluate((sel) => {
        return document.querySelector(sel) !== null;
      }, selector);
      
      if (!selectorExists) {
        return {
          success: false,
          error: 'سلکتور در صفحه یافت نشد',
          url,
          selector,
          type,
          suggestions: await this.generateSelectorSuggestions(page, selector),
          pageInfo: await this.getPageInfo(page)
        };
      }
      
      // استخراج اطلاعات با سلکتور
      const result = await page.evaluate((sel, testType) => {
        try {
          const elements = document.querySelectorAll(sel);
          
          if (testType === 'list') {
            return {
              count: elements.length,
              samples: Array.from(elements).slice(0, 5).map((el, index) => {
                const text = el.textContent?.trim() || '';
                const href = el.href || el.getAttribute('href') || null;
                
                return {
                  index: index + 1,
                  text: text.substring(0, 150),
                  href: href,
                  tagName: el.tagName.toLowerCase(),
                  className: el.className || '',
                  id: el.id || ''
                };
              })
            };
          } else if (testType === 'content') {
            return {
              count: elements.length,
              samples: Array.from(elements).slice(0, 3).map((el, index) => {
                const text = el.textContent?.trim() || '';
                return {
                  index: index + 1,
                  text: text.substring(0, 300),
                  tagName: el.tagName.toLowerCase(),
                  className: el.className || '',
                  id: el.id || ''
                };
              })
            };
          } else {
            // تست عمومی
            return {
              count: elements.length,
              samples: Array.from(elements).slice(0, 3).map((el, index) => {
                const text = el.textContent?.trim() || '';
                return {
                  index: index + 1,
                  text: text.substring(0, 200),
                  tagName: el.tagName.toLowerCase(),
                  className: el.className || '',
                  id: el.id || '',
                  attributes: Array.from(el.attributes).reduce((acc, attr) => {
                    acc[attr.name] = attr.value;
                    return acc;
                  }, {})
                };
              })
            };
          }
        } catch (evalError) {
          return {
            error: 'خطا در اجرای سلکتور: ' + evalError.message,
            count: 0,
            samples: []
          };
        }
      }, selector, type);
      
      const duration = Date.now() - startTime;
      
      await page.close();
      
      logger.success(`تست سلکتور موفقیت‌آمیز: ${result.count} عنصر یافت شد در ${duration}ms`);
      
      return {
        success: true,
        url,
        selector,
        type,
        result,
        duration,
        timestamp: new Date().toISOString(),
        performance: {
          loadTime: duration,
          elementsFound: result.count,
          status: result.count > 0 ? 'excellent' : 'warning'
        }
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // تشخیص نوع خطا و ارائه راهکار
      let errorType = 'unknown';
      let suggestion = '';
      
      if (error.message.includes('Navigation timeout')) {
        errorType = 'timeout';
        suggestion = 'صفحه در زمان مقرر بارگذاری نشد. ممکن است سایت کند باشد یا مشکل اتصال وجود داشته باشد.';
      } else if (error.message.includes('net::ERR_')) {
        errorType = 'network';
        suggestion = 'مشکل در اتصال به سایت. لطفاً URL را بررسی کنید.';
      } else if (error.message.includes('Protocol error')) {
        errorType = 'browser';
        suggestion = 'مشکل در مرورگر. ممکن است نیاز به راه‌اندازی مجدد باشد.';
      }
      
      logger.error(`خطا در تست سلکتور (${errorType}):`, error.message);
      
      return {
        success: false,
        error: error.message,
        errorType,
        suggestion,
        url,
        selector,
        type,
        duration,
        timestamp: new Date().toISOString()
      };
    } finally {
      // تمیز کردن منابع
      try {
        if (page && !page.isClosed()) {
          await page.close();
        }
      } catch (closeError) {
        logger.warn('خطا در بستن صفحه:', closeError.message);
      }
    }
  }
  
  // تولید پیشنهادات سلکتور
  async generateSelectorSuggestions(page, originalSelector) {
    try {
      return await page.evaluate((original) => {
        const suggestions = [];
        
        // پیشنهادات بر اساس تگ‌های رایج
        const commonTags = ['a', 'h1', 'h2', 'h3', 'p', 'div', 'span', 'article'];
        commonTags.forEach(tag => {
          const elements = document.querySelectorAll(tag);
          if (elements.length > 0) {
            suggestions.push({
              selector: tag,
              count: elements.length,
              description: `همه تگ‌های ${tag}`
            });
          }
        });
        
        // پیشنهادات بر اساس کلاس‌های موجود
        const allElements = document.querySelectorAll('*');
        const classNames = new Set();
        
        Array.from(allElements).forEach(el => {
          if (el.className && typeof el.className === 'string') {
            el.className.split(' ').forEach(cls => {
              if (cls.trim() && cls.includes('news') || cls.includes('article') || cls.includes('link')) {
                classNames.add(cls.trim());
              }
            });
          }
        });
        
        Array.from(classNames).slice(0, 5).forEach(className => {
          const elements = document.querySelectorAll(`.${className}`);
          if (elements.length > 0) {
            suggestions.push({
              selector: `.${className}`,
              count: elements.length,
              description: `عناصر با کلاس ${className}`
            });
          }
        });
        
        return suggestions.slice(0, 10);
      }, originalSelector);
    } catch {
      return [];
    }
  }
  
  // دریافت اطلاعات صفحه
  async getPageInfo(page) {
    try {
      return await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          totalElements: document.querySelectorAll('*').length,
          links: document.querySelectorAll('a').length,
          images: document.querySelectorAll('img').length,
          readyState: document.readyState
        };
      });
    } catch {
      return {};
    }
  }
}

module.exports = UniversalCrawler;