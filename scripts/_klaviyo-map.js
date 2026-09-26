'use strict';
// Merge one saved get_catalog_items page into a master SKU→image map.
// Usage: node _klaviyo-map.js <savedPageFile>
const fs = require('fs');
const MAP = __dirname + '/klaviyo-catalog.json';
const file = process.argv[2];

const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const data = (raw.result && raw.result.data) || raw.data || [];
const map = fs.existsSync(MAP) ? JSON.parse(fs.readFileSync(MAP, 'utf8')) : {};
let added = 0;
for (const it of data) {
  const a = it.attributes || it;
  const sku = a.external_id;
  if (!sku) continue;
  map[String(sku).trim()] = { title: a.title, img: a.image_full_url || a.image_thumbnail_url || null };
  added++;
}
fs.writeFileSync(MAP, JSON.stringify(map, null, 0));
const next = raw.result && raw.result.links && raw.result.links.next;
console.log(`page items: ${data.length}, added/updated: ${added}, master total: ${Object.keys(map).length}`);
// Coverage against the recipe SKUs
if (fs.existsSync(__dirname + '/recipe-skus.json')) {
  const recipeSkus = JSON.parse(fs.readFileSync(__dirname + '/recipe-skus.json', 'utf8'));
  const all = Object.keys(recipeSkus);
  const found = all.filter(s => map[s] && map[s].img);
  console.log(`recipe-SKU coverage: ${found.length}/${all.length} have a Klaviyo image so far`);
}
console.log('next cursor token:', next ? decodeURIComponent((next.match(/page(?:%5B|\[)cursor(?:%5D|\])=([^&]+)/) || [])[1] || '') : '(none — last page)');
