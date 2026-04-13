export type Language = "zh" | "en";

interface Messages {
  help: string;
  subscribe_success: string;
  subscribe_success_no_articles: string;
  subscribe_failed: string;
  unsubscribe_success: string;
  unsubscribe_failed: string;
  list_empty: string;
  list_header: string;
  url_required: string;
  preview_enabled: string;
  preview_disabled: string;
  preview_invalid: string;
  error_processing: string;
  article_prefix: string;
}

const messages: Record<Language, Messages> = {
  zh: {
    help: `/sub <rss_url> - 订阅一个 RSS 源
/unsub <rss_url> - 取消订阅 RSS 源
/list - 列出所有订阅的 RSS 源
/preview <on|off> - 开启或关闭链接预览`,
    subscribe_success: "成功订阅 RSS 源：[{title}]({url})\n\n最新文章：\n{article}",
    subscribe_success_no_articles: "成功订阅 RSS 源：[{title}]({url})\n\n当前没有任何文章",
    subscribe_failed: "订阅失败：{error}",
    unsubscribe_success: "已取消订阅 RSS 源：{url}",
    unsubscribe_failed: "取消订阅失败：{error}",
    list_empty: "还没有订阅任何 RSS 源",
    list_header: "订阅列表：",
    url_required: "请提供 RSS 源的 URL",
    preview_enabled: "已开启链接预览",
    preview_disabled: "已关闭链接预览",
    preview_invalid: "请使用 /preview on 或 /preview off",
    error_processing: "处理命令时发生错误，请稍后重试",
    article_prefix: "📰",
  },
  en: {
    help: `/sub <rss_url> - Subscribe to RSS feed
/unsub <rss_url> - Unsubscribe from RSS feed
/list - List all subscribed RSS feeds
/preview <on|off> - Enable or disable link preview`,
    subscribe_success: "Successfully subscribed to RSS feed: [{title}]({url})\n\nLatest article:\n{article}",
    subscribe_success_no_articles: "Successfully subscribed to RSS feed: [{title}]({url})\n\nNo articles available",
    subscribe_failed: "Subscription failed: {error}",
    unsubscribe_success: "Unsubscribed from RSS feed: {url}",
    unsubscribe_failed: "Unsubscribe failed: {error}",
    list_empty: "No RSS feeds subscribed yet",
    list_header: "Subscription list:",
    url_required: "Please provide the RSS feed URL",
    preview_enabled: "Link preview enabled",
    preview_disabled: "Link preview disabled",
    preview_invalid: "Use /preview on or /preview off",
    error_processing: "Error processing command, please try again later",
    article_prefix: "📰",
  },
};

export function getMessage(lang: Language, key: keyof Messages, params: Record<string, string> = {}): string {
  let message = messages[lang][key];
  Object.entries(params).forEach(([key, value]) => {
    message = message.replace(`{${key}}`, value);
  });
  return message;
}