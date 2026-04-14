import { Database } from "./utils/db";
import { RSSUtil } from "./utils/rss";
import { CommandHandler } from "./handlers/commands";
import { TelegramMessage } from "@codebam/cf-workers-telegram-bot";
import { sendMessage } from "./utils/tgapi";
import { getMessage } from "./utils/i18n";

interface TelegramUpdate {
  message?: TelegramMessage;
}

interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  UPDATE_INTERVAL: number;
}

/**
 * 智能处理链接逻辑：自动识别订阅或退订
 */
async function handleSmartLink(message: TelegramMessage, handler: CommandHandler, db: Database) {
  const text = message.text?.trim() || "";
  const userId = message.from?.id || 0;
  
  // 检查这个链接是否已经在数据库里
  const existingSub = await db.getSubscription(userId, text);

  if (existingSub) {
    // 如果存在，执行取消订阅逻辑
    await handler.handleUnsubscribe(message);
  } else {
    // 如果不存在，执行订阅逻辑
    await handler.handleSubscribe(message);
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const db = new Database(env.DB);
    const rssUtil = new RSSUtil(env.UPDATE_INTERVAL);
    const commandHandler = new CommandHandler(db, rssUtil, env.TELEGRAM_BOT_TOKEN);

    if (request.method === "POST") {
      const update = (await request.json()) as TelegramUpdate;
      const message = update.message;

      if (!message?.text) {
        return new Response("OK");
      }

      const text = message.text.trim();
      const command = text.split(" ")[0];

      try {
        // --- 核心逻辑：智能识别纯链接 ---
        // 如果不是以 / 开头，且看起来像个链接
        if (!text.startsWith("/") && (text.startsWith("http://") || text.startsWith("https://"))) {
          await handleSmartLink(message, commandHandler, db);
          return new Response("OK");
        }

        switch (command) {
          case "/start":
            await commandHandler.handleStart(message);
            break;
          case "/sub":
            await commandHandler.handleSubscribe(message);
            break;
          case "/unsub":
            await commandHandler.handleUnsubscribe(message);
            break;
          case "/list":
            await commandHandler.handleList(message);
            break;
          case "/lang":
            await commandHandler.handleLanguage(message);
            break;
          case "/preview":
            await commandHandler.handlePreview(message);
            break;
        }
      } catch (error) {
        console.error("Error handling command:", error);
        const lang = await db.getUserLanguage(message.from?.id || 0);
        await commandHandler.sendMessage(message.chat.id, getMessage(lang, "error_processing"));
      }
    }

    return new Response("OK");
  },

  async scheduled(event: ScheduledEvent | null, env: Env, _ctx: ExecutionContext) {
    console.log("scheduled event triggered at ", new Date().toISOString());
    const db = new Database(env.DB);
    const rssUtil = new RSSUtil(env.UPDATE_INTERVAL);

    try {
      const subscriptions = await db.getSubscriptionsToUpdate(env.UPDATE_INTERVAL);
      const fetchPromises = subscriptions.map(async (sub) => {
        try {
          const { items } = await rssUtil.fetchFeed(sub.feed_url);
          const lastItemGuid = sub.last_item_guid;

          const lastIndex = lastItemGuid ? items.findIndex((item) => item.guid === lastItemGuid) : -1;
          const newItems = lastIndex >= 0 ? items.slice(0, lastIndex) : items.slice(0, 1);

          if (newItems.length > 0) {
            const previewEnabled = await db.getPreviewSetting(sub.user_id);
            const messages = newItems.map((item) => rssUtil.formatMessage(item, sub.feed_title));
            let lastSentGuid = sub.last_item_guid;
            for (const [index, message] of messages.entries()) {
              try {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, sub.user_id, message, { disable_web_page_preview: !previewEnabled });
                lastSentGuid = newItems[index].guid;
              } catch (error) {
                console.error(`Failed to send message for ${newItems[index].title}:`, error);
              }
            }

            if (lastSentGuid !== sub.last_item_guid) {
              await db.updateLastFetch(sub.user_id, sub.feed_url, Date.now(), lastSentGuid);
            }
          }
        } catch (error) {
          console.error(`Error processing subscription ${sub.feed_url}:`, error);
        }
      });
      await Promise.all(fetchPromises);
    } catch (error) {
      console.error("Error in scheduled task:", error);
    }
  },
};
