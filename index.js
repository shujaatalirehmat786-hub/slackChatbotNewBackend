import express from 'express';
import bodyParser from 'body-parser';
import { App, ExpressReceiver } from '@slack/bolt';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// --- Setup OpenAI client ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Setup Express receiver (so we can define app.post) ---
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// --- Create a Slack Bolt app with custom receiver ---
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

// --- POST route for Slack Event Subscriptions ---
receiver.router.post('/slack/events', bodyParser.json(), async (req, res) => {
  const { challenge } = req.body;

  // Handle Slack's URL verification
  if (challenge) {
    return res.status(200).send({ challenge });
  }

  // Immediately acknowledge receipt
  res.sendStatus(200);
});

// --- Event listener for @mentions ---
app.event('app_mention', async ({ event, client, say }) => {
  try {
    // 1️⃣ Fetch last 20 messages from the same channel
    const history = await client.conversations.history({
      channel: event.channel,
      limit: 20,
    });

    const messages = history.messages
      .map((msg) => `• ${msg.user || 'unknown'}: ${msg.text}`)
      .join('\n');

    // 2️⃣ Create GPT prompt using context
    const prompt = `
You are a helpful Slack assistant.
Here are the last 20 messages from this channel:

${messages}

Now answer based only on that conversation.
User asked: "${event.text}"
`;

    // 3️⃣ Send context to GPT
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: prompt }],
    });

    const reply = completion.choices[0].message.content;

    // 4️⃣ Reply in Slack
    await say(reply);
  } catch (error) {
    console.error('❌ Error in app_mention:', error);
    await say('Sorry, something went wrong while fetching messages.');
  }
});

// --- Start server ---
(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`⚡️ Slack GPT bot running and listening on port ${port}`);
})();
