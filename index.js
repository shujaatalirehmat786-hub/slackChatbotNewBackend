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

// ✅ Slack event endpoint
app.post('/slack/events', async (req, res) => {
  const { event, challenge } = req.body;

  // Slack URL verification
  if (challenge) {
    return res.status(200).send({ challenge });
  }

  // Respond quickly to avoid timeout
  res.sendStatus(200);

  try {
    // Ignore bot’s own messages
    if (!event || event.bot_id) return;

    // Handle mentions and direct messages
    if (event.type === 'app_mention' || event.channel_type === 'im') {
      console.log(`📩 User mentioned bot in channel: ${event.channel}`);

      // ✅ Fetch the last 15 messages from this specific channel
      const history = await slackClient.conversations.history({
        channel: event.channel,
        limit: 15,
      });

      // Log the messages in console for debugging
      console.log('📜 Recent messages in channel:');
      history.messages.forEach((msg, i) => {
        console.log(`${i + 1}. ${msg.user || 'unknown'}: ${msg.text}`);
      });

      // Clean the user’s message (remove mention text)
      const userMessage = event.text.replace(/<@[^>]+>/, '').trim();

      // Format messages as readable text
      const formattedHistory = history.messages
        .map((msg) => `${msg.user || 'unknown'}: ${msg.text}`)
        .join('\n');

      // Combine history + user question into one contextual prompt
      const prompt = `
You are a helpful assistant in a Slack workspace.
These are the latest messages from this channel:

${formattedHistory}

Now, based on this context, respond naturally to the user's new message:
"${userMessage}"
      `;

      // Send the contextual request to ChatGPT
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: prompt }],
      });

      const reply = completion.choices[0].message.content;

      // Send GPT’s reply back to Slack
      await slackClient.chat.postMessage({
        channel: event.channel,
        text: reply,
      });

      console.log('✅ Reply sent to Slack successfully.');
    }
  } catch (err) {
    console.error('❌ Error handling Slack event:', err);
  }
});

// Start the bot
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Slack GPT Bot running on port ${PORT}`));
