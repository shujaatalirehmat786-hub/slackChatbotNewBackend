import express from 'express';
import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

app.get('/test-messages', async (req, res) => {
  try {
    // Replace with your actual channel ID (starts with C or G)
    const channelId = process.env.TEST_CHANNEL_ID;

    const history = await slackClient.conversations.history({
      channel: channelId,
      limit: 10, // number of messages to fetch
    });

    console.log('📜 Recent Messages from Slack Channel:\n');
    history.messages.forEach((msg, i) => {
      console.log(`${i + 1}. ${msg.user || 'unknown'}: ${msg.text}`);
    });

    res.json({ success: true, count: history.messages.length });
  } catch (err) {
    console.error('❌ Error fetching Slack messages:', err);
    res.status(500).send('Failed to fetch channel messages');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
