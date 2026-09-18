const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

const SELLAUTH_API_KEY = process.env.SELLAUTH_API_KEY;
const SELLAUTH_SHOP_ID = process.env.SHOP_ID;
const DISCORD_WEBHOOK = process.env.RESTOCK_WEBHOOK_URL;
const RESTOCK_ROLE_ID = process.env.RESTOCK_ROLE_ID;
const WEBHOOK_SECRET = process.env.SELLAUTH_WEBHOOK_SECRET;

const SELLAUTH_DOMAIN = process.env.SELLAUTH_DOMAIN || 'your-shop.mysellauth.com';
const STORE_NAME = process.env.STORE_NAME || 'Your Store Name';

async function getProduct(productId) {
  const res = await fetch(
    `https://api.sellauth.com/v1/shops/${SELLAUTH_SHOP_ID}/products/${productId}`,
    { headers: { Authorization: `Bearer ${SELLAUTH_API_KEY}` } }
  );
  return res.json();
}

async function sendRestockEmbed(product, variant) {
  const discordRes = await fetch(DISCORD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `<@&${RESTOCK_ROLE_ID}>`,
      embeds: [{
        title: `${product.name} Restocked`,
        url: `https://${SELLAUTH_DOMAIN}/product/${product.path}`,
        color: 0xFFFFFF,
        fields: [
          { name: 'Restocked', value: variant.name, inline: false },
          { name: 'Variant',   value: variant.name, inline: false },
          { name: 'Price',     value: `€${variant.price}`, inline: false },
          { name: 'Stock',     value: String(variant.stock), inline: false },
        ],
        image: { url: product.images?.[0]?.url ?? '' },
        footer: { text: STORE_NAME },
        timestamp: new Date().toISOString(),
      }],
    }),
  });
  console.log('Discord response status:', discordRes.status);
  console.log('Discord response:', await discordRes.text());
}

function verifySignature(req) {
  const signature = req.headers['x-signature'];
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');
  return expected === signature;
}

app.post('/sellauth-webhook', async (req, res) => {
  console.log('Received event:', JSON.stringify(req.body));
  if (!verifySignature(req)) {
    console.log('Invalid signature');
    return res.status(401).send('Invalid signature');
  }
  console.log('Signature valid');
  const { event, data } = req.body;
  if (event === 'NOTIFICATION.SHOP_PRODUCT_RESTOCKED') {
    console.log('Fetching product:', data.product_id);
    const product = await getProduct(data.product_id);
    console.log('Product fetched:', JSON.stringify(product));
    const variant = product.variants?.find(v => v.id === data.restocked_variant_ids[0])
                    ?? product.variants?.[0];
    console.log('Variant:', JSON.stringify(variant));
    await sendRestockEmbed(product, variant);
    console.log('Embed sent');
  }
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () => console.log('Restock server running'));
