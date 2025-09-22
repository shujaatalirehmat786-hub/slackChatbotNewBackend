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

  // Slack URL verification
  if (challenge) {
    return res.status(200).send({ challenge });
  }

  try {
    if (
      event &&
      (event.type === 'app_mention' || event.channel_type === 'im')
    ) {
      const userMessage = event.text.replace(/<@[^>]+>/, '').trim();

      // Send message to OpenAI (Custom GPT)
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // Replace with the model you want
        messages: [{ role: 'user', content: userMessage }],
      });

      const reply = response.choices[0].message.content;

      // Send reply back to Slack
      await slackClient.chat.postMessage({
        channel: event.channel,
        text: reply,
      });
    }
  } catch (err) {
    console.error('Error handling Slack event:', err);
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Slack GPT Bot running on port ${PORT}`));
