import { App } from '@slack/bolt';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// --- Event listener for @mentions ---
app.event('app_mention', async ({ event, client, say }) => {
  try {
    // 1️⃣ Fetch last 20 messages from the channel
    const history = await client.conversations.history({
      channel: event.channel,
      limit: 20,
    });

    const messages = history.messages
      .map((msg) => `• ${msg.user || 'unknown'}: ${msg.text}`)
      .join('\n');

    // 2️⃣ Combine messages into a context for GPT
    const prompt = `
You are a helpful assistant for Slack.
Here are the last 20 messages from this Slack channel:

${messages}

Now answer the user's question based only on the above conversation.
User question: "${event.text}"
    `;

    // 3️⃣ Send the message context to GPT
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: prompt }],
    });

    const reply = completion.choices[0].message.content;

    // 4️⃣ Reply in Slack
    await say(reply);
  } catch (error) {
    console.error('Error in app_mention:', error);
    await say('Sorry, something went wrong while fetching messages.');
  }
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Slack GPT bot is running!');
})();
