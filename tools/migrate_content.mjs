/**
 * One-time migration: HTML content → Markdown content_md
 *
 * Converts existing HTML posts to Markdown and writes back to content_md.
 *
 * Prerequisites:
 *   npm install turndown
 *
 * Usage:
 *   Set SUPABASE_URL and SUPABASE_KEY environment variables, then:
 *   node migrate_content.mjs
 *
 * Or run directly against Supabase Dashboard SQL Editor.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pukmwienoiknatnpzobk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1a213aWVub2lrbmF0bnB6b2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyOTYyMjgsImV4cCI6MjA3OTg3MjIyOH0.OXSEMos-dlXKk0exU4e-ZKTFo2vxDpm5jRMCRGqSSp0';

// Simple HTML → Markdown converter (no external dep needed for basic conversion)
function htmlToMarkdown(html) {
  if (!html) return '';
  let md = html;
  // Block elements
  md = md.replace(/<p[^>]*>/gi, '\n');
  md = md.replace(/<\/p>/gi, '\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '\n> $1\n');
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)');
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
  // Strip remaining tags
  md = md.replace(/<[^>]+>/g, '');
  // Decode entities
  md = md.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  return md;
}

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: posts, error } = await sb.from('posts').select('*');
  if (error) { console.error('Fetch error:', error.message); process.exit(1); }

  console.log(`Found ${posts.length} posts.`);

  let migrated = 0;
  for (const post of posts) {
    if (post.content_md && post.content_md.trim()) {
      console.log(`  ✓ "${post.title}" — already has content_md, skipping`);
      continue;
    }
    const md = htmlToMarkdown(post.content);
    const { error: updErr } = await sb.from('posts').update({ content_md: md }).eq('id', post.id);
    if (updErr) {
      console.error(`  ✗ "${post.title}" — update failed:`, updErr.message);
    } else {
      console.log(`  ✓ "${post.title}" — migrated (${md.length} chars)`);
      migrated++;
    }
  }

  console.log(`\nDone. ${migrated} post(s) migrated.`);
}

main();
