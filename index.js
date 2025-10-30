import express from 'express';
import bodyParser from 'body-parser';
import { WebClient } from '@slack/web-api';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(bodyParser.json());

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Store short conversation history per channel (in memory)
const conversationHistory = {};

// Slack event endpoint
app.post('/slack/events', async (req, res) => {
  const { event, challenge } = req.body;

  // Slack verification handshake
  if (challenge) {
    return res.status(200).send({ challenge });
  }

  // Always respond quickly to avoid retries
  res.sendStatus(200);

  try {
    // Ignore bot’s own messages
    if (!event || event.bot_id) return;

    // Handle only mentions or direct messages
    if (event.type === 'app_mention' || event.channel_type === 'im') {
      const userMessage = event.text.replace(/<@[^>]+>/, '').trim();

      // 1️⃣ Fetch last 20 messages from the same channel
      const history = await slackClient.conversations.history({
        channel: event.channel,
        limit: 20,
      });

      // Build a context summary for GPT
      const recentMessages = history.messages
        .map((msg) => `${msg.user || 'unknown'}: ${msg.text}`)
        .join('\n');

      // 2️⃣ Build prompt with context + current message
      const prompt = `
You are a helpful, friendly Slack assistant.
Below are the last 20 messages from this Slack channel:

${recentMessages}

Now respond to the user’s new message:
"${userMessage}"
      `;

      // 3️⃣ Send message to OpenAI
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: prompt },
        ],
      });

      const reply = completion.choices[0].message.content;

      // 4️⃣ Reply to Slack
      await slackClient.chat.postMessage({
        channel: event.channel,
        text: reply,
      });
    }
  } catch (err) {
    console.error('❌ Error handling Slack event:', err);
  }
});

// Start the bot
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Slack GPT Bot running on port ${PORT}`));
