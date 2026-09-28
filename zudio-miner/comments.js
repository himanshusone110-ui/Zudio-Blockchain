// ZUDIO.FUN - Comments Component (comments.js)
// One text box. Submit only if wallet is unlocked.
// Browser cryptographically signs comment text before submitting.
// Renders author, text, and time from GET /api/comments.

import { getActiveWallet } from "./vault.js";
import { sha256 } from "./_vendor/node_modules/@noble/hashes/sha2.js";
import * as secp from "./_vendor/node_modules/@noble/secp256k1/index.js";

function messageHash(text) {
  return sha256(sha256(new TextEncoder().encode(text)));
}

async function signText(text) {
  const wallet = getActiveWallet();
  if (!wallet) throw new Error("Wallet is locked. Please sign in first.");
  const hash = messageHash(text);
  const sig = await secp.signAsync(hash, wallet.secretBytes, { prehash: false });
  return secp.etc.bytesToHex(sig);
}

export async function fetchAndRenderComments(tick, containerId = "commentsList") {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const res = await fetch(`/api/comments?tick=${encodeURIComponent(tick)}`);
    const data = await res.json();
    const comments = data.comments || [];

    if (comments.length === 0) {
      container.innerHTML = `
        <div class="empty-sub-state">
          <p>No comments yet. Be the first to start the discussion!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = comments.map(c => {
      const d = new Date(c.time * 1000);
      const timeStr = d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const shortAddr = c.author ? c.author.slice(0, 10) + "..." + c.author.slice(-6) : "Anonymous";

      return `
        <div class="comment-item">
          <div class="comment-header">
            <a href="profile.html?address=${encodeURIComponent(c.author)}" class="comment-author" title="${c.author}">
              👤 ${shortAddr}
            </a>
            <span class="comment-time">${timeStr}</span>
          </div>
          <div class="comment-body">${escapeHtml(c.text)}</div>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error("Failed to load comments:", err);
    container.innerHTML = `<div class="empty-sub-state error">Failed to load comments</div>`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function setupComments(tick, formId = "commentForm", inputId = "commentInput", statusId = "commentStatus") {
  const form = document.getElementById(formId);
  const input = document.getElementById(inputId);
  const status = document.getElementById(statusId);
  if (!form || !input) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (status) { status.textContent = ""; status.className = "trade-note"; }

    const wallet = getActiveWallet();
    if (!wallet) {
      if (status) {
        status.textContent = "⚠️ Please unlock your wallet to post a comment.";
        status.className = "trade-note error";
      }
      return;
    }

    const text = input.value.trim();
    if (!text) return;

    try {
      if (status) {
        status.textContent = "⏳ Signing comment with private key...";
        status.className = "trade-note";
      }

      // Browser signs the comment text
      const sig = await signText(text);

      const res = await fetch("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tick: tick.toUpperCase(),
          author: wallet.address,
          text: text,
          pub: wallet.pubHex,
          sig: sig
        })
      });

      const resData = await res.json();
      if (!res.ok || resData.error) {
        throw new Error(resData.error || "Failed to post comment");
      }

      input.value = "";
      if (status) {
        status.textContent = "✅ Comment posted successfully!";
        status.className = "trade-note success";
        setTimeout(() => { if (status) status.textContent = ""; }, 3000);
      }

      fetchAndRenderComments(tick);
    } catch (err) {
      console.error("Comment submit error:", err);
      if (status) {
        status.textContent = "❌ " + err.message;
        status.className = "trade-note error";
      }
    }
  });

  // Initial load
  fetchAndRenderComments(tick);
}
