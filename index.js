
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

// Store short conversation history per channel
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
    // Ignore bot’s own messages to prevent infinite loops
    if (!event || event.bot_id) return;

    // Handle only mentions or direct messages
    if (event.type === 'app_mention' || event.channel_type === 'im') {
      // Clean mention text if present
      const userMessage = event.text.replace(/<@[^>]+>/, '').trim();

      // Initialize conversation history for this channel
      if (!conversationHistory[event.channel]) {
        conversationHistory[event.channel] = [];
      }

      // Add user message to history
      conversationHistory[event.channel].push({ role: 'user', content: userMessage });

      // Keep only the last 10 messages for context
      if (conversationHistory[event.channel].length > 10) {
        conversationHistory[event.channel] = conversationHistory[event.channel].slice(-10);
      }

      // Send message to OpenAI
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful, friendly Slack assistant. Always respond conversationally and naturally. Keep answers clear, short, and context-aware.',
          },
          ...conversationHistory[event.channel],
        ],
      });

      const reply = completion.choices[0].message.content;

      // Add assistant’s reply to history
      conversationHistory[event.channel].push({ role: 'assistant', content: reply });

      // Send the reply back to Slack
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
