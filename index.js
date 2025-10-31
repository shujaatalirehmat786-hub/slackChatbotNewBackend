import express from "express";
import bodyParser from "body-parser";
import { WebClient } from "@slack/web-api";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- POST endpoint for Slack Events ---
app.post("/slack/events", async (req, res) => {
  const { challenge, event } = req.body;

  // Slack URL verification
  if (challenge) {
    return res.status(200).send({ challenge });
  }

  // Respond quickly so Slack doesn't retry
  res.sendStatus(200);

  try {
    // Ignore bot's own messages
    if (!event || event.bot_id) return;

    // Only respond to app mentions or direct messages
    if (event.type === "app_mention" || event.channel_type === "im") {
      const channelId = event.channel;
      const userMessage = event.text.replace(/<@[^>]+>/, "").trim();

      // ✅ Fetch recent messages from the same channel
      const history = await slackClient.conversations.history({
        channel: channelId,
        limit: 10,
      });

      console.log("📜 Recent messages from Slack channel:");
      history.messages.forEach((msg, i) => {
        console.log(`${i + 1}. ${msg.user || "unknown"}: ${msg.text}`);
      });

      // ✅ Create context for GPT
      const messagesContext = history.messages
        .map((msg) => `${msg.user || "unknown"}: ${msg.text}`)
        .join("\n");

      const prompt = `
You are a helpful assistant inside Slack.
Use the following recent channel messages as context:

${messagesContext}

Now respond to the user's latest message:
"${userMessage}"
      `;

      // ✅ Ask GPT with context
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });

      const reply =
        completion.choices[0]?.message?.content ||
        "I wasn’t able to generate a proper response.";

      // ✅ Send GPT reply back to Slack
      await slackClient.chat.postMessage({
        channel: channelId,
        text: reply,
      });
    }
  } catch (error) {
    console.error("❌ Error handling Slack event:", error);
  }
});

// --- Health route for Railway ---
app.get("/", (req, res) => {
  res.send("✅ Slack GPT bot backend is running.");
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Slack GPT bot running on port ${PORT}`);
});
