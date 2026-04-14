import { TelegramMessage as Message } from "@codebam/cf-workers-telegram-bot";
import { Database } from "../utils/db";
import { RSSUtil } from "../utils/rss";
import { sendMessage } from "../utils/tgapi";
import { Language, getMessage } from "../utils/i18n";

export class CommandHandler {
  constructor(private db: Database, private rssUtil: RSSUtil, private token: string) {}

  async sendMessage(chatId: number, text: string, options?: Record<string, any>) {
    return await sendMessage(this.token, chatId, text, options);
  }

  async handleStart(message: Message): Promise<void> {
    const userId = message.from?.id;
    if (!userId) return;

    const lang = await this.db.getUserLanguage(userId);
    const helpText = getMessage(lang, "help");
    await this.sendMessage(message.chat.id, helpText, { disable_web_page_preview: true });
  }

  async handleLanguage(message: Message): Promise<void> {
    const userId = message.from?.id;
    if (!userId) return;

    const currentLang = await this.db.getUserLanguage(userId);
    const newLang: Language = currentLang === "zh" ? "en" : "zh";
    await this.db.setUserLanguage(userId, newLang);

    // 显示新语言的帮助信息
    const helpText = getMessage(newLang, "help");
    await this.sendMessage(message.chat.id, helpText, { disable_web_page_preview: true });
  }

  async handlePreview(message: Message): Promise<void> {
    const userId = message.from?.id;
    const chatId = message.chat.id;
    if (!userId) return;

    const lang = await this.db.getUserLanguage(userId);
    const param = message.text?.split(" ")[1]?.toLowerCase();
    if (param !== "on" && param !== "off") {
      await this.sendMessage(chatId, getMessage(lang, "preview_invalid"));
      return;
    }

    const enabled = param === "on";
    await this.db.setPreviewSetting(chatId, enabled);
    await this.sendMessage(chatId, getMessage(lang, enabled ? "preview_enabled" : "preview_disabled"));
  }

  async handleSubscribe(message: Message): Promise<void> {
    const userId = message.from?.id;
    const chatId = message.chat.id;
    if (!userId) return;

    const lang = await this.db.getUserLanguage(userId);
    
    // 核心修改：如果文本中有空格，取第二部分（对应 /sub url）；如果没有空格，取整条文本（对应直接发链接）
    const textParts = message.text?.trim().split(" ");
    const feedUrl = textParts && textParts.length > 1 ? textParts[1] : textParts?.[0];

    if (!feedUrl) {
      await this.sendMessage(chatId, getMessage(lang, "url_required"));
      return;
    }

    try {
      // 先尝试获取 feed，确保 URL 有效
      const { items, feedTitle } = await this.rssUtil.fetchFeed(feedUrl);

      // 添加订阅，使用 chatId 作为推送目标
      await this.db.addSubscription(chatId, feedUrl, feedTitle);

      // 更新最后获取时间和 GUID
      if (items.length > 0) {
        await this.db.updateLastFetch(chatId, feedUrl, Date.now(), items[0].guid);

        // 发送成功订阅消息和最新文章
        const latestArticle = this.rssUtil.formatMessage(items[0], undefined, lang);
        await this.sendMessage(chatId, getMessage(lang, "subscribe_success", { title: feedTitle, url: feedUrl, article: latestArticle }));
      } else {
        await this.sendMessage(chatId, getMessage(lang, "subscribe_success_no_articles", { title: feedTitle, url: feedUrl }));
      }
    } catch (error) {
      await this.sendMessage(chatId, getMessage(lang, "subscribe_failed", { error: error instanceof Error ? error.message : "Unknown error" }));
    }
  }

  async handleUnsubscribe(message: Message): Promise<void> {
    const userId = message.from?.id;
    const chatId = message.chat.id;
    if (!userId) return;

    const lang = await this.db.getUserLanguage(userId);
    
    // 核心修改：同上，兼容命令模式和直接链接模式
    const textParts = message.text?.trim().split(" ");
    const feedUrl = textParts && textParts.length > 1 ? textParts[1] : textParts?.[0];

    if (!feedUrl) {
      await this.sendMessage(chatId, getMessage(lang, "url_required"));
      return;
    }

    try {
      await this.db.removeSubscription(chatId, feedUrl);
      await this.sendMessage(chatId, getMessage(lang, "unsubscribe_success", { url: feedUrl }));
    } catch (error) {
      await this.sendMessage(chatId, getMessage(lang, "unsubscribe_failed", { error: error instanceof Error ? error.message : "Unknown error" }));
    }
  }

  async handleList(message: Message): Promise<void> {
    const userId = message.from?.id;
    const chatId = message.chat.id;
    if (!userId) return;

    const lang = await this.db.getUserLanguage(userId);
    const subscriptions = await this.db.listSubscriptions(chatId);
    if (subscriptions.length === 0) {
      await this.sendMessage(chatId, getMessage(lang, "list_empty"));
      return;
    }

    const subscriptionList = subscriptions.map((sub, index) => `${index + 1}. [${sub.feed_title}](${sub.feed_url})`).join("\n");
    await this.sendMessage(chatId, `${getMessage(lang, "list_header")}\n${subscriptionList}`);
  }
}
