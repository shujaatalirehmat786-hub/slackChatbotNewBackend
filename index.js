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

// Store short conversation memory for continuity
const conversationHistory = {};

// Slack event endpoint
app.post('/slack/events', async (req, res) => {
  const { event, challenge } = req.body;

  // Slack URL verification
  if (challenge) return res.status(200).send({ challenge });

  // Respond quickly to avoid Slack retry
  res.sendStatus(200);

  try {
    if (!event || event.bot_id) return;

    // Handle @mentions or direct messages
    if (event.type === 'app_mention' || event.channel_type === 'im') {
      const userMessage = event.text.replace(/<@[^>]+>/, '').trim();

      // --- 1️⃣ Fetch recent messages from Slack channel ---
      const history = await slackClient.conversations.history({
        channel: event.channel,
        limit: 15, // last 15 messages
      });

      // Format Slack messages into readable context
      const recentMessages = history.messages
        .reverse() // so oldest first
        .map((msg) => {
          const username = msg.user || 'someone';
          const text = msg.text || '';
          return `${username}: ${text}`;
        })
        .join('\n');

      // --- 2️⃣ Maintain short memory per channel ---
      if (!conversationHistory[event.channel]) {
        conversationHistory[event.channel] = [];
      }

      conversationHistory[event.channel].push({
        role: 'user',
        content: userMessage,
      });

      // Keep only 10 last messages in memory
      if (conversationHistory[event.channel].length > 10) {
        conversationHistory[event.channel] = conversationHistory[event.channel].slice(-10);
      }

      // --- 3️⃣ Create contextual GPT prompt ---
      const systemPrompt = `
You are a helpful Slack assistant.
Use the following recent Slack messages and conversation memory for context.
If a user asks about something not in the context, politely say you can’t see older messages.

Recent Slack messages:
${recentMessages}
`;

      // --- 4️⃣ Send to OpenAI ---
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory[event.channel],
        ],
      });

      const reply = completion.choices[0].message.content;

      // --- 5️⃣ Store and send reply back to Slack ---
      conversationHistory[event.channel].push({
        role: 'assistant',
        content: reply,
      });

      await slackClient.chat.postMessage({
        channel: event.channel,
        text: reply,
        thread_ts: event.ts, // reply in thread for clarity
      });
    }
  } catch (err) {
    console.error('❌ Error handling Slack event:', err);
  }
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Slack GPT Bot running on port ${PORT}`));
