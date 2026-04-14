import Parser from "rss-parser";
import { Language, getMessage } from "./i18n";

export interface FeedItem {
  title: string;
  link: string;
  guid: string;
  pubDate?: string;
  summary?: string;
}

interface CacheEntry {
  items: FeedItem[];
  feedTitle: string;
  timestamp: number;
}

export class RSSUtil {
  private parser: Parser;
  private cache: Map<string, CacheEntry>;
  private readonly CACHE_TTL: number;

  constructor(private readonly updateInterval: number) {
    this.CACHE_TTL = updateInterval * 1000;
    this.parser = new Parser({
      timeout: 3000, // 优化：将 5000ms 减少到 3000ms，减轻 Worker 负担
      headers: {
        "User-Agent": "Telegram RSS Bot/1.0",
      },
    });
    this.cache = new Map();
  }

  /**
   * 获取 RSS 源的最新文章
   */
  async fetchFeed(url: string): Promise<{ items: FeedItem[]; feedTitle: string }> {
    // 检查缓存
    const cached = this.cache.get(url);
    const now = Date.now();
    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return { items: cached.items, feedTitle: cached.feedTitle };
    }

    try {
      const response = await fetch(url);
      const xml = await response.text();
      const feed = await this.parser.parseString(xml);
      
      const items = feed.items.map((item) => ({
        title: item.title || "Untitled",
        link: item.link || url,
        // 核心修复：移除 Math.random()，使用固定属性生成 GUID 以防止重复推送
        guid: item.guid || item.link || `${url}_${item.title || 'no-title'}_${item.pubDate || ''}`,
        pubDate: item.pubDate,
        summary: sanitizeSummary(item.contentSnippet || item.summary || item.content || item.description),
      }));

      // 更新缓存
      this.cache.set(url, {
        items,
        feedTitle: feed.title?.trim() || url,
        timestamp: now,
      });

      return { items, feedTitle: feed.title?.trim() || url };
    } catch (error: unknown) {
      console.error(`Error fetching RSS feed from ${url}:`, error);
      throw error;
    }
  }

  formatMessage(item: FeedItem, feedTitle?: string, lang: Language = "zh"): string {
    const prefix = getMessage(lang, "article_prefix");
    const header = feedTitle ? `${prefix} ${feedTitle}:\n[${item.title}](${item.link})` : `${prefix} [${item.title}](${item.link})`;
    // 优化：将摘要长度限制从 200 缩减至 100，节省 CPU 和消息空间
    const summary = item.summary ? `\n\n${truncateSummary(item.summary, 100)}` : "";
    return `${header}${summary}`;
  }
}

function sanitizeSummary(text?: string): string {
  if (!text) return "";
  // 移除 HTML 标签和多余空格
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function truncateSummary(text: string, maxLength: number): string {
  const trimmed = text.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength)}...`;
}