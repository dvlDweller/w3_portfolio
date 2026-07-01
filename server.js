const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const HF_API_TOKEN = process.env.HF_API_TOKEN;
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_TO = process.env.EMAIL_TO || 'asta053006@gmail.com';

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const emailTransport = (EMAIL_HOST && EMAIL_PORT && EMAIL_USER && EMAIL_PASS) ? nodemailer.createTransport({
  host: EMAIL_HOST,
  port: Number(EMAIL_PORT),
  secure: Number(EMAIL_PORT) === 465,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
}) : null;

function isLeadMessage(message) {
  const normalized = message.toLowerCase();
  const contactPattern = /\b(email|gmail|yahoo|outlook|hotmail|@|phone|tel|contact|whatsapp|telegram|discord|line|signal|viber)\b/;
  const businessPattern = /\b(quote|project|work|price|cost|hire|job|service|collaborate|partnership|contract|payment|schedule|meeting|proposal|client|business|deal|interested|need|offer)\b/;
  const hasContactInfo = contactPattern.test(normalized);
  const hasBusinessIntent = businessPattern.test(normalized) && normalized.length > 30;
  return hasContactInfo || hasBusinessIntent;
}

async function sendLeadEmail(message) {
  if (!emailTransport || !EMAIL_TO) {
    console.warn('Email transport is not configured. Lead email not sent.');
    return false;
  }

  const mailOptions = {
    from: EMAIL_USER,
    to: EMAIL_TO,
    subject: 'New potential lead from Crypto Asta chatbot',
    text: `A visitor sent a message through the chatbot:\n\n${message}`
  };

  try {
    await emailTransport.sendMail(mailOptions);
    console.log('Lead email sent successfully.');
    return true;
  } catch (error) {
    console.error('Failed to send lead email:', error?.response || error.message || error);
    return false;
  }
}

app.post('/api/chat', async (req, res) => {
  const message = req.body?.message;
  if (!message) {
    return res.status(400).json({ error: 'No message was provided.' });
  }

  const lead = isLeadMessage(message);
  let emailed = false;
  if (lead) {
    emailed = await sendLeadEmail(message);
    if (!emailed) {
      console.warn('Lead detected but email was not sent. Check SMTP credentials.');
    }
  }

  if (!HF_API_TOKEN) {
    return res.json({
      reply: 'Remote AI is not configured. Install a Hugging Face token in .env to enable remote responses.',
      lead,
      emailed,
    });
  }

  try {
    const response = await fetch('https://api-inference.huggingface.co/models/google/flan-t5-large', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: message })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error || 'AI inference request failed.' });
    }

    let reply = '';
    if (Array.isArray(data) && data.length > 0 && data[0].generated_text) {
      reply = data[0].generated_text;
    } else if (data.generated_text) {
      reply = data.generated_text;
    } else {
      reply = JSON.stringify(data);
    }

    return res.json({ reply: reply.trim(), lead, emailed });
  } catch (error) {
    return res.status(500).json({ error: error.message, lead, emailed });
  }
});

app.post('/api/lead', async (req, res) => {
  const message = req.body?.message;
  if (!message) {
    return res.status(400).json({ error: 'No message was provided.' });
  }

  const isLead = isLeadMessage(message);
  let emailed = false;

  if (isLead) {
    emailed = await sendLeadEmail(message);
    if (!emailed) {
      console.warn('Lead detected but email is not configured properly.');
    }
  }

  return res.json({ lead: isLead, emailed });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
