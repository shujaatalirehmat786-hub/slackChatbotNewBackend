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

  // Respond quickly to avoid Slack retries
  res.sendStatus(200);

  try {
    // Ignore bot's own messages
    if (!event || event.bot_id) return;

    // Handle only mentions (or optionally DMs)
    if (event.type === 'app_mention' || event.channel_type === 'im') {
      // Clean mention text
      const userMessage = event.text.replace(/<@[^>]+>/, '').trim();

      // Fetch last 20 messages from the channel
      const history = await slackClient.conversations.history({
        channel: event.channel,
        limit: 20,
      });

      // Prepare past conversation messages
      const pastMessages = history.messages
        .reverse()
        .map((msg) => msg.text)
        .join('\n');

      // Combine context + user request
      const prompt = `
Here are the recent messages in this Slack channel:

${pastMessages}

Now, based on this conversation context, answer this user's new message naturally:
"${userMessage}"
      `;

      // Send context to OpenAI
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an assistant for a Slack workspace. Analyze the past channel discussion and reply naturally and contextually based on it.',
          },
          { role: 'user', content: prompt },
        ],
      });

      const reply = completion.choices[0].message.content;

      // Reply to Slack (in thread for better UX)
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
