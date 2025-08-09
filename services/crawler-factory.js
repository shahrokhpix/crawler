const puppeteer = require('puppeteer-core');
const { Launcher } = require('chrome-launcher');
const cheerio = require('cheerio');
const axios = require('axios');
const logger = require('../utils/logger');

// Base Crawler Class
class BaseCrawler {
  constructor(source) {
    this.source = source;
    this.type = source.crawler_type || 'puppeteer';
  }

  async crawl(options = {}) {
    throw new Error('crawl method must be implemented by subclass');
  }

  async testSelector(url, selector) {
    throw new Error('testSelector method must be implemented by subclass');
  }

  generateHash(title, link) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(title + link).digest('hex');
  }

  normalizeUrl(url, baseUrl) {
    if (url.startsWith('http')) {
      return url;
    }
    if (url.startsWith('/')) {
      const base = new URL(baseUrl);
      return `${base.protocol}//${base.host}${url}`;
    }
    return new URL(url, baseUrl).href;
  }
}

// Puppeteer Crawler
class PuppeteerCrawler extends BaseCrawler {
  constructor(source) {
    super(source);
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
          '--accept-lang=fa-IR,fa,en-US,en'
        ]
      });
    }
    return this.browser;
  }

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
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(60000);
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
  }

  async crawl(options = {}) {
    const { limit = 10, fullContent = true } = options;
    const page = await this.getOrCreatePage();
    const articles = [];

    try {
      await page.goto(this.source.base_url, { waitUntil: 'networkidle2' });
      await page.waitForTimeout(3000);

      // Extract article links
      const links = await page.evaluate((selector) => {
        const elements = document.querySelectorAll(selector);
        return Array.from(elements).map(el => {
          const href = el.getAttribute('href');
          return href;
        }).filter(href => href);
      }, this.source.list_selector);

      logger.info(`یافت شد ${links.length} لینک برای ${this.source.name}`);

      for (let i = 0; i < Math.min(links.length, limit); i++) {
        const link = this.normalizeUrl(links[i], this.source.base_url);
        
        try {
          await page.goto(link, { waitUntil: 'networkidle2' });
          await page.waitForTimeout(2000);

          const article = await page.evaluate((titleSelector, contentSelector) => {
            const titleEl = document.querySelector(titleSelector);
            const title = titleEl ? titleEl.textContent.trim() : '';
            
            let content = '';
            if (contentSelector) {
              const contentEls = document.querySelectorAll(contentSelector);
              content = Array.from(contentEls).map(el => el.textContent.trim()).join(' ');
            }

            return { title, content };
          }, this.source.title_selector, this.source.content_selector);

          if (article.title) {
            articles.push({
              title: article.title,
              link: link,
              content: fullContent ? article.content : '',
              hash: this.generateHash(article.title, link)
            });
          }
        } catch (error) {
          logger.warn(`خطا در استخراج مقاله ${link}:`, error.message);
        }
      }
    } catch (error) {
      logger.error(`خطا در crawl با Puppeteer:`, error.message);
      throw error;
    } finally {
      await this.releasePage(page);
    }

    return articles;
  }

  async testSelector(url, selector) {
    const page = await this.getOrCreatePage();
    
    try {
      await page.goto(url, { waitUntil: 'networkidle2' });
      await page.waitForTimeout(3000);

      const result = await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel);
        return {
          found: elements.length,
          samples: Array.from(elements).slice(0, 3).map(el => ({
            text: el.textContent.trim().substring(0, 100),
            html: el.outerHTML.substring(0, 200)
          }))
        };
      }, selector);

      return result;
    } catch (error) {
      logger.error(`خطا در تست سلکتور:`, error.message);
      throw error;
    } finally {
      await this.releasePage(page);
    }
  }

  async close() {
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
}

// Cheerio Crawler (Fast, server-side DOM parsing)
class CheerioCrawler extends BaseCrawler {
  constructor(source) {
    super(source);
    this.axiosInstance = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
  }

  async crawl(options = {}) {
    const { limit = 10, fullContent = true } = options;
    const articles = [];

    try {
      // Get main page
      const response = await this.axiosInstance.get(this.source.base_url);
      const $ = cheerio.load(response.data);

      // Extract article links
      const links = [];
      $(this.source.list_selector).each((i, el) => {
        const href = $(el).attr('href');
        if (href) {
          links.push(this.normalizeUrl(href, this.source.base_url));
        }
      });

      logger.info(`یافت شد ${links.length} لینک برای ${this.source.name} (Cheerio)`);

      for (let i = 0; i < Math.min(links.length, limit); i++) {
        const link = links[i];
        
        try {
          const articleResponse = await this.axiosInstance.get(link);
          const article$ = cheerio.load(articleResponse.data);

          const title = article$(this.source.title_selector).first().text().trim();
          let content = '';
          
          if (fullContent && this.source.content_selector) {
            const contentParts = [];
            article$(this.source.content_selector).each((i, el) => {
              contentParts.push(article$(el).text().trim());
            });
            content = contentParts.join(' ');
          }

          if (title) {
            articles.push({
              title: title,
              link: link,
              content: content,
              hash: this.generateHash(title, link)
            });
          }
        } catch (error) {
          logger.warn(`خطا در استخراج مقاله ${link} (Cheerio):`, error.message);
        }
      }
    } catch (error) {
      logger.error(`خطا در crawl با Cheerio:`, error.message);
      throw error;
    }

    return articles;
  }

  async testSelector(url, selector) {
    try {
      const response = await this.axiosInstance.get(url);
      const $ = cheerio.load(response.data);

      const elements = $(selector);
      const samples = [];
      
      elements.slice(0, 3).each((i, el) => {
        samples.push({
          text: $(el).text().trim().substring(0, 100),
          html: $.html(el).substring(0, 200)
        });
      });

      return {
        found: elements.length,
        samples: samples
      };
    } catch (error) {
      logger.error(`خطا در تست سلکتور (Cheerio):`, error.message);
      throw error;
    }
  }

  async close() {
    // Cheerio doesn't need cleanup
  }
}

// Playwright Crawler (Alternative to Puppeteer)
class PlaywrightCrawler extends BaseCrawler {
  constructor(source) {
    super(source);
    this.browser = null;
    this.context = null;
  }

  async initBrowser() {
    if (!this.browser) {
      try {
        const { chromium } = require('playwright');
        this.browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.context = await this.browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          locale: 'fa-IR'
        });
      } catch (error) {
        logger.warn('Playwright not available, falling back to Puppeteer');
        throw new Error('Playwright not installed. Please install with: npm install playwright');
      }
    }
    return this.browser;
  }

  async crawl(options = {}) {
    const { limit = 10, fullContent = true } = options;
    const articles = [];

    try {
      await this.initBrowser();
      const page = await this.context.newPage();

      await page.goto(this.source.base_url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      // Extract article links
      const links = await page.evaluate((selector) => {
        const elements = document.querySelectorAll(selector);
        return Array.from(elements).map(el => el.getAttribute('href')).filter(href => href);
      }, this.source.list_selector);

      logger.info(`یافت شد ${links.length} لینک برای ${this.source.name} (Playwright)`);

      for (let i = 0; i < Math.min(links.length, limit); i++) {
        const link = this.normalizeUrl(links[i], this.source.base_url);
        
        try {
          await page.goto(link, { waitUntil: 'networkidle' });
          await page.waitForTimeout(2000);

          const article = await page.evaluate((titleSelector, contentSelector) => {
            const titleEl = document.querySelector(titleSelector);
            const title = titleEl ? titleEl.textContent.trim() : '';
            
            let content = '';
            if (contentSelector) {
              const contentEls = document.querySelectorAll(contentSelector);
              content = Array.from(contentEls).map(el => el.textContent.trim()).join(' ');
            }

            return { title, content };
          }, this.source.title_selector, this.source.content_selector);

          if (article.title) {
            articles.push({
              title: article.title,
              link: link,
              content: fullContent ? article.content : '',
              hash: this.generateHash(article.title, link)
            });
          }
        } catch (error) {
          logger.warn(`خطا در استخراج مقاله ${link} (Playwright):`, error.message);
        }
      }

      await page.close();
    } catch (error) {
      logger.error(`خطا در crawl با Playwright:`, error.message);
      throw error;
    }

    return articles;
  }

  async testSelector(url, selector) {
    try {
      await this.initBrowser();
      const page = await this.context.newPage();
      
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      const result = await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel);
        return {
          found: elements.length,
          samples: Array.from(elements).slice(0, 3).map(el => ({
            text: el.textContent.trim().substring(0, 100),
            html: el.outerHTML.substring(0, 200)
          }))
        };
      }, selector);

      await page.close();
      return result;
    } catch (error) {
      logger.error(`خطا در تست سلکتور (Playwright):`, error.message);
      throw error;
    }
  }

  async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Selenium Crawler (WebDriver)
class SeleniumCrawler extends BaseCrawler {
  constructor(source) {
    super(source);
    this.driver = null;
  }

  async initDriver() {
    if (!this.driver) {
      try {
        const { Builder, By, until } = require('selenium-webdriver');
        const chrome = require('selenium-webdriver/chrome');
        
        const options = new chrome.Options();
        options.addArguments('--headless');
        options.addArguments('--no-sandbox');
        options.addArguments('--disable-dev-shm-usage');
        options.addArguments('--lang=fa-IR');
        
        this.driver = await new Builder()
          .forBrowser('chrome')
          .setChromeOptions(options)
          .build();
      } catch (error) {
        logger.warn('Selenium not available, falling back to Puppeteer');
        throw new Error('Selenium WebDriver not installed. Please install with: npm install selenium-webdriver');
      }
    }
    return this.driver;
  }

  async crawl(options = {}) {
    const { limit = 10, fullContent = true } = options;
    const articles = [];

    try {
      await this.initDriver();
      const { By, until } = require('selenium-webdriver');

      await this.driver.get(this.source.base_url);
      await this.driver.sleep(3000);

      // Extract article links
      const linkElements = await this.driver.findElements(By.css(this.source.list_selector));
      const links = [];
      
      for (const element of linkElements) {
        try {
          const href = await element.getAttribute('href');
          if (href) {
            links.push(this.normalizeUrl(href, this.source.base_url));
          }
        } catch (error) {
          // Skip invalid elements
        }
      }

      logger.info(`یافت شد ${links.length} لینک برای ${this.source.name} (Selenium)`);

      for (let i = 0; i < Math.min(links.length, limit); i++) {
        const link = links[i];
        
        try {
          await this.driver.get(link);
          await this.driver.sleep(2000);

          let title = '';
          try {
            const titleElement = await this.driver.findElement(By.css(this.source.title_selector));
            title = await titleElement.getText();
          } catch (error) {
            // Title not found
          }

          let content = '';
          if (fullContent && this.source.content_selector) {
            try {
              const contentElements = await this.driver.findElements(By.css(this.source.content_selector));
              const contentParts = [];
              for (const el of contentElements) {
                const text = await el.getText();
                if (text.trim()) {
                  contentParts.push(text.trim());
                }
              }
              content = contentParts.join(' ');
            } catch (error) {
              // Content not found
            }
          }

          if (title) {
            articles.push({
              title: title.trim(),
              link: link,
              content: content,
              hash: this.generateHash(title.trim(), link)
            });
          }
        } catch (error) {
          logger.warn(`خطا در استخراج مقاله ${link} (Selenium):`, error.message);
        }
      }
    } catch (error) {
      logger.error(`خطا در crawl با Selenium:`, error.message);
      throw error;
    }

    return articles;
  }

  async testSelector(url, selector) {
    try {
      await this.initDriver();
      const { By } = require('selenium-webdriver');
      
      await this.driver.get(url);
      await this.driver.sleep(3000);

      const elements = await this.driver.findElements(By.css(selector));
      const samples = [];
      
      for (let i = 0; i < Math.min(elements.length, 3); i++) {
        try {
          const text = await elements[i].getText();
          const html = await elements[i].getAttribute('outerHTML');
          samples.push({
            text: text.substring(0, 100),
            html: html.substring(0, 200)
          });
        } catch (error) {
          // Skip invalid elements
        }
      }

      return {
        found: elements.length,
        samples: samples
      };
    } catch (error) {
      logger.error(`خطا در تست سلکتور (Selenium):`, error.message);
      throw error;
    }
  }

  async close() {
    if (this.driver) {
      await this.driver.quit();
      this.driver = null;
    }
  }
}

// WebDriver Crawler (Generic WebDriver)
class WebDriverCrawler extends SeleniumCrawler {
  constructor(source) {
    super(source);
    // WebDriver is essentially the same as Selenium
    // This is kept for compatibility and future extensions
  }
}

// Factory function to create appropriate crawler
function createCrawler(source) {
  const crawlerType = source.crawler_type || 'puppeteer';
  
  switch (crawlerType.toLowerCase()) {
    case 'cheerio':
      return new CheerioCrawler(source);
    case 'playwright':
      return new PlaywrightCrawler(source);
    case 'selenium':
      return new SeleniumCrawler(source);
    case 'webdriver':
      return new WebDriverCrawler(source);
    case 'puppeteer':
    default:
      return new PuppeteerCrawler(source);
  }
}

module.exports = {
  createCrawler,
  BaseCrawler,
  PuppeteerCrawler,
  CheerioCrawler,
  PlaywrightCrawler,
  SeleniumCrawler,
  WebDriverCrawler
};