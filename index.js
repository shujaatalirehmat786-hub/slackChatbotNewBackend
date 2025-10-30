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

// Slack event endpoint
app.post('/slack/events', async (req, res) => {
  const { event, challenge } = req.body;

  if (challenge) return res.status(200).send({ challenge });
  res.sendStatus(200);

  try {
    if (!event || event.bot_id) return;

    if (event.type === 'app_mention' || event.channel_type === 'im') {
      const userMessage = event.text.replace(/<@[^>]+>/, '').trim();

      // Fetch last 20 messages for context
      const history = await slackClient.conversations.history({
        channel: event.channel,
        limit: 20,
      });

      // Convert Slack messages into chat format for OpenAI
      const contextMessages = history.messages
        .reverse()
        .map((msg) => ({
          role: msg.user === event.user ? 'user' : 'assistant',
          content: msg.text,
        }));

      contextMessages.push({
        role: 'user',
        content: userMessage,
      });

      // Generate context-based reply
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a Slack assistant. You already have the recent Slack messages as context, so never say you lack access to Slack. Respond conversationally and helpfully based on this context.',
          },
          ...contextMessages,
        ],
      });

      const reply = completion.choices[0].message.content;

      // Reply in thread
      await slackClient.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text: reply,
      });
    }
  } catch (err) {
    console.error('Error handling Slack event:', err);
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`💬 Slack GPT Context Bot running on port ${PORT}`));
