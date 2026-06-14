/**
 * Blood Donation & Emergency Connect Bot
 * Main Application Script
 */


const STORAGE_KEYS = {
  CHATS: "bloodconnect_chats",
  ACTIVE_CHAT: "bloodconnect_active_chat",
  CHAT_HISTORY: "bloodconnect_chat_history",
  THEME: "bloodconnect_theme",
  TTS_ENABLED: "bloodconnect_tts_enabled",
};

const WELCOME_MESSAGE =
  "Hello! I'm your Blood Donation & Emergency Connect assistant. I can help with blood compatibility, donor eligibility, emergency guidance, donation procedures, and FAQs. How can I assist you today?";

const SYSTEM_PROMPT = `You are Blood Donation & Emergency Connect Bot.

Your responsibilities:

1. Provide accurate blood donation information.
2. Explain blood compatibility.
3. Guide users during blood emergencies.
4. Explain donor eligibility requirements.
5. Educate users about blood donation.
6. Answer FAQs clearly and professionally.
7. Be compassionate and supportive.
8. Never provide medical diagnosis.
9. Encourage contacting hospitals and healthcare professionals during emergencies.
10. If the request is outside blood donation, politely redirect the conversation.

KNOWLEDGE BASE:

Blood Groups: A+, A-, B+, B-, AB+, AB-, O+, O-

Compatibility (Donor → Recipient):
- O- : Universal donor (can donate to all). Can receive from O- only.
- O+ : Can donate to O+, A+, B+, AB+. Can receive from O+, O-.
- A- : Can donate to A+, A-, AB+, AB-. Can receive from A-, O-.
- A+ : Can donate to A+, AB+. Can receive from A+, A-, O+, O-.
- B- : Can donate to B+, B-, AB+, AB-. Can receive from B-, O-.
- B+ : Can donate to B+, AB+. Can receive from B+, B-, O+, O-.
- AB- : Can donate to AB+, AB-. Can receive from all negative types.
- AB+ : Universal recipient (can receive from all). Can donate to AB+ only.

Donation Eligibility:
- Minimum age: 17 years (16 with parental consent in some regions)
- Minimum weight: 50 kg (110 lbs)
- Must be in good general health
- Hemoglobin: 12.5 g/dL (women), 13.0 g/dL (men)
- Waiting period: 56 days between whole blood donations
- Restrictions: recent illness, certain medications, pregnancy, recent tattoos/piercings, travel to malaria areas

Emergency Guidance:
1. Call emergency services (911) for life-threatening situations
2. Contact hospital blood bank immediately
3. Provide blood group, units needed, location
4. Reach out to blood donation organizations
5. Use community networks responsibly

Donation Process:
1. Registration - ID and form
2. Screening - questionnaire, physical exam, hemoglobin check
3. Donation - 10-15 minutes, ~450ml
4. Recovery - rest 10-15 minutes, refreshments
5. Aftercare - hydrate, iron-rich foods, avoid strenuous activity

Benefits:
- Health: stimulates blood cell production, free health screening
- Community: saves up to 3 lives per donation
- Myths debunked: donation does not weaken immune system, is safe with sterile equipment

Format responses using markdown (headings, bullet lists, bold, numbered steps). Keep responses concise and well-structured.`;

/* ============================================
   State
   ============================================ */

let allChats = [];
let activeChatId = null;
let isLoading = false;
let ttsEnabled = false;
let recognition = null;
let isListening = false;

/* ============================================
   DOM Elements
   ============================================ */

const DOM = {
  sidebar: document.getElementById("sidebar"),
  sidebarOverlay: document.getElementById("sidebarOverlay"),
  sidebarClose: document.getElementById("sidebarClose"),
  menuBtn: document.getElementById("menuBtn"),
  themeToggle: document.getElementById("themeToggle"),
  themeToggleMobile: document.getElementById("themeToggleMobile"),
  navLinks: document.querySelectorAll(".nav-link"),
  sections: document.querySelectorAll(".section"),
  startChatBtn: document.getElementById("startChatBtn"),
  emergencyBtn: document.getElementById("emergencyBtn"),
  chatMessages: document.getElementById("chatMessages"),
  chatInput: document.getElementById("chatInput"),
  sendBtn: document.getElementById("sendBtn"),
  typingIndicator: document.getElementById("typingIndicator"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  newChatBtn: document.getElementById("newChatBtn"),
  exportChatBtn: document.getElementById("exportChatBtn"),
  clearChatBtn: document.getElementById("clearChatBtn"),
  quickBtns: document.querySelectorAll(".quick-btn"),
  voiceBtn: document.getElementById("voiceBtn"),
  ttsToggleBtn: document.getElementById("ttsToggleBtn"),
  emergencyForm: document.getElementById("emergencyForm"),
  toast: document.getElementById("toast"),
  welcomeTime: document.getElementById("welcomeTime"),
  guideChatBtn: document.getElementById("guideChatBtn"),
  eligibilityChatBtn: document.getElementById("eligibilityChatBtn"),
  faqChatBtn: document.getElementById("faqChatBtn"),
  chatsList: document.getElementById("chatsList"),
  newChatFromListBtn: document.getElementById("newChatFromListBtn"),
};

/* ============================================
   Utility Functions
   ============================================ */

function sanitizeInput(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .trim();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function stripMarkdown(text) {
  return text
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[-*+]\s/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return formatTime(date);
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function generateId() {
  return "chat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
}

function showToast(message, type = "info") {
  DOM.toast.textContent = message;
  DOM.toast.className = `toast ${type}`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    DOM.toast.classList.add("hidden");
  }, 3500);
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
  });
}

function getActiveChat() {
  return allChats.find((c) => c.id === activeChatId) || null;
}

function getConversationHistory() {
  const chat = getActiveChat();
  return chat ? chat.messages : [];
}

/* ============================================
   Markdown Rendering
   ============================================ */

function initMarkdown() {
  if (typeof marked !== "undefined") {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }
}

function renderMarkdown(text) {
  if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
    const raw = marked.parse(text);
    return DOMPurify.sanitize(raw, {
      ADD_ATTR: ["target"],
      ALLOWED_TAGS: [
        "h1", "h2", "h3", "h4", "h5", "h6",
        "p", "br", "strong", "em", "b", "i", "u",
        "ul", "ol", "li",
        "code", "pre",
        "blockquote", "hr",
        "a", "table", "thead", "tbody", "tr", "th", "td",
      ],
    });
  }
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function renderMessageContent(role, content) {
  if (role === "user") {
    return `<p>${escapeHtml(content)}</p>`;
  }
  return renderMarkdown(content);
}

/* ============================================
   Theme Management
   ============================================ */

function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.THEME);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(STORAGE_KEYS.THEME, next);
}

/* ============================================
   Navigation
   ============================================ */

function navigateTo(sectionId) {
  DOM.sections.forEach((section) => {
    section.classList.toggle("active", section.id === sectionId);
  });

  DOM.navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.section === sectionId);
  });

  closeSidebar();

  if (sectionId === "chat") {
    scrollToBottom();
    DOM.chatInput.focus();
  }

  if (sectionId === "chats") {
    renderChatsList();
  }
}

function openSidebar() {
  DOM.sidebar.classList.add("open");
  DOM.sidebarOverlay.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeSidebar() {
  DOM.sidebar.classList.remove("open");
  DOM.sidebarOverlay.classList.remove("active");
  document.body.style.overflow = "";
}

/* ============================================
   Chat Session Management
   ============================================ */

function createChat(title = "New Chat") {
  const chat = {
    id: generateId(),
    title,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  allChats.unshift(chat);
  activeChatId = chat.id;
  saveChats();
  return chat;
}

function switchToChat(chatId) {
  const chat = allChats.find((c) => c.id === chatId);
  if (!chat) return;

  activeChatId = chatId;
  localStorage.setItem(STORAGE_KEYS.ACTIVE_CHAT, chatId);
  renderChatMessages();
  renderChatsList();
}

function deleteChat(chatId, event) {
  if (event) {
    event.stopPropagation();
  }

  if (!confirm("Delete this chat? This cannot be undone.")) return;

  allChats = allChats.filter((c) => c.id !== chatId);

  if (activeChatId === chatId) {
    if (allChats.length > 0) {
      activeChatId = allChats[0].id;
    } else {
      createChat();
    }
    renderChatMessages();
  }

  saveChats();
  renderChatsList();
  showToast("Chat deleted.", "success");
}

function updateChatTitle(chat, firstUserMessage) {
  if (chat.title !== "New Chat") return;
  chat.title = firstUserMessage.length > 50
    ? firstUserMessage.slice(0, 50) + "…"
    : firstUserMessage;
}

function startNewChat() {
  createChat();
  renderChatMessages();
  renderChatsList();
  navigateTo("chat");
  showToast("New chat started.", "success");
}

function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(allChats));
    localStorage.setItem(STORAGE_KEYS.ACTIVE_CHAT, activeChatId);
  } catch (error) {
    console.warn("Failed to save chats:", error);
  }
}

function migrateLegacyHistory() {
  const legacy = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
  if (!legacy || allChats.length > 0) return;

  try {
    const messages = JSON.parse(legacy);
    if (!Array.isArray(messages) || messages.length === 0) return;

    const firstUser = messages.find((m) => m.role === "user");
    const title = firstUser
      ? firstUser.content.slice(0, 50) + (firstUser.content.length > 50 ? "…" : "")
      : "Previous Chat";

    const chat = {
      id: generateId(),
      title,
      messages,
      createdAt: messages[0]?.timestamp || Date.now(),
      updatedAt: messages[messages.length - 1]?.timestamp || Date.now(),
    };

    allChats = [chat];
    activeChatId = chat.id;
    localStorage.removeItem(STORAGE_KEYS.CHAT_HISTORY);
    saveChats();
  } catch (error) {
    console.warn("Legacy migration failed:", error);
  }
}

function loadChats() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.CHATS);
    if (saved) {
      allChats = JSON.parse(saved);
    }
    activeChatId = localStorage.getItem(STORAGE_KEYS.ACTIVE_CHAT);

    migrateLegacyHistory();

    if (allChats.length === 0) {
      createChat();
    } else if (!activeChatId || !allChats.find((c) => c.id === activeChatId)) {
      activeChatId = allChats[0].id;
    }
  } catch (error) {
    console.warn("Failed to load chats:", error);
    allChats = [];
    createChat();
  }
}

/* ============================================
   Chat UI
   ============================================ */

function createMessageElement(role, content, timestamp) {
  const isUser = role === "user";
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isUser ? "user-message" : "bot-message"}`;

  const avatarDiv = document.createElement("div");
  avatarDiv.className = `message-avatar ${isUser ? "user-avatar" : "bot-avatar"}`;
  avatarDiv.innerHTML = isUser
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  const bubbleDiv = document.createElement("div");
  bubbleDiv.className = isUser ? "message-bubble" : "message-bubble markdown-body";
  bubbleDiv.innerHTML = renderMessageContent(role, content);

  const timeSpan = document.createElement("span");
  timeSpan.className = "message-time";
  timeSpan.textContent = formatTime(new Date(timestamp));

  contentDiv.appendChild(bubbleDiv);

  if (!isUser) {
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "message-actions";
    const speakBtn = document.createElement("button");
    speakBtn.className = "speak-btn";
    speakBtn.title = "Read aloud";
    speakBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>';
    speakBtn.addEventListener("click", () => speakText(stripMarkdown(content)));
    actionsDiv.appendChild(speakBtn);
    contentDiv.appendChild(actionsDiv);
  }

  contentDiv.appendChild(timeSpan);
  messageDiv.appendChild(avatarDiv);
  messageDiv.appendChild(contentDiv);

  return messageDiv;
}

function renderWelcomeMessage() {
  const timestamp = Date.now();
  const messageEl = createMessageElement("assistant", WELCOME_MESSAGE, timestamp);
  DOM.chatMessages.appendChild(messageEl);
  if (DOM.welcomeTime) {
    DOM.welcomeTime.textContent = formatTime(new Date(timestamp));
  }
}

function renderChatMessages() {
  DOM.chatMessages.innerHTML = "";
  const chat = getActiveChat();

  if (!chat || chat.messages.length === 0) {
    renderWelcomeMessage();
    return;
  }

  chat.messages.forEach(({ role, content, timestamp }) => {
    const messageEl = createMessageElement(role, content, timestamp);
    DOM.chatMessages.appendChild(messageEl);
  });

  scrollToBottom();
}

function appendMessage(role, content, save = true) {
  const timestamp = Date.now();
  const messageEl = createMessageElement(role, content, timestamp);
  DOM.chatMessages.appendChild(messageEl);
  scrollToBottom();

  if (save) {
    const chat = getActiveChat();
    if (!chat) return;

    chat.messages.push({ role, content, timestamp });
    chat.updatedAt = timestamp;

    if (role === "user") {
      const userMessages = chat.messages.filter((m) => m.role === "user");
      if (userMessages.length === 1) {
        updateChatTitle(chat, content);
      }
    }

    saveChats();
    renderChatsList();
  }
}

function renderChatsList() {
  if (!DOM.chatsList) return;

  if (allChats.length === 0) {
    DOM.chatsList.innerHTML = `
      <div class="chats-empty glass">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        <h3>No chats yet</h3>
        <p>Start a conversation to see your chat history here.</p>
      </div>`;
    return;
  }

  DOM.chatsList.innerHTML = allChats
    .map((chat) => {
      const lastMsg = chat.messages[chat.messages.length - 1];
      const preview = lastMsg
        ? stripMarkdown(lastMsg.content).slice(0, 80) + (lastMsg.content.length > 80 ? "…" : "")
        : "No messages yet";
      const count = chat.messages.length;
      const isActive = chat.id === activeChatId;

      return `
        <div class="chat-item glass${isActive ? " active" : ""}" data-chat-id="${chat.id}">
          <div class="chat-item-icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </div>
          <div class="chat-item-body">
            <div class="chat-item-title">${escapeHtml(chat.title)}</div>
            <div class="chat-item-preview">${escapeHtml(preview)}</div>
          </div>
          <div class="chat-item-meta">
            <span class="chat-item-date">${formatDate(chat.updatedAt)}</span>
            <span class="chat-item-count">${count} msg${count !== 1 ? "s" : ""}</span>
            <button class="chat-item-delete" data-delete-id="${chat.id}" title="Delete chat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </div>`;
    })
    .join("");

  DOM.chatsList.querySelectorAll(".chat-item").forEach((item) => {
    item.addEventListener("click", () => {
      switchToChat(item.dataset.chatId);
      navigateTo("chat");
    });
  });

  DOM.chatsList.querySelectorAll(".chat-item-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => deleteChat(btn.dataset.deleteId, e));
  });
}

function showTypingIndicator() {
  DOM.typingIndicator.classList.remove("hidden");
  scrollToBottom();
}

function hideTypingIndicator() {
  DOM.typingIndicator.classList.add("hidden");
}

function setLoading(loading) {
  isLoading = loading;
  DOM.sendBtn.disabled = loading;
  DOM.chatInput.disabled = loading;

  if (loading) {
    showTypingIndicator();
  } else {
    hideTypingIndicator();
    DOM.loadingOverlay.classList.add("hidden");
  }
}

function autoResizeTextarea() {
  DOM.chatInput.style.height = "auto";
  DOM.chatInput.style.height = Math.min(DOM.chatInput.scrollHeight, 120) + "px";
}

/* ============================================
   OpenAI API (direct call from browser)
   ============================================ */

async function sendToOpenAI() {

  const messages = getConversationHistory().map(({ role, content }) => ({
    role,
    content,
  }));

  const response = await fetch("/.netlify/functions/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages
    ]
  }),
});

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `API request failed (${response.status})`);
  }

  return data.choices[0].message.content;
}

async function handleSendMessage(messageText) {
  const sanitized = sanitizeInput(messageText || DOM.chatInput.value);

  if (!sanitized) {
    showToast("Please enter a message.", "error");
    return;
  }

  if (isLoading) return;

  DOM.chatInput.value = "";
  autoResizeTextarea();
  appendMessage("user", sanitized);
  setLoading(true);

  try {
    const reply = await sendToOpenAI();
    appendMessage("assistant", reply);

    if (ttsEnabled) {
      speakText(stripMarkdown(reply));
    }
  } catch (error) {
    console.error("Chat error:", error);

    let errorMsg = error.message;
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
      errorMsg = "Cannot connect to OpenAI API. Please check your internet connection.";
    }

    appendMessage(
      "assistant",
      `I'm sorry, I encountered an error: ${errorMsg}. Please ensure the OPENAI_API_KEY environment variable is set in Netlify.`
    );
    showToast(errorMsg, "error");
  } finally {
    setLoading(false);
    DOM.chatInput.focus();
  }
}

function clearChat() {
  const chat = getActiveChat();
  if (!chat || chat.messages.length === 0) {
    showToast("Chat is already empty.");
    return;
  }

  if (!confirm("Clear all messages in this chat? This cannot be undone.")) return;

  chat.messages = [];
  chat.title = "New Chat";
  chat.updatedAt = Date.now();
  saveChats();
  renderChatMessages();
  renderChatsList();
  showToast("Chat cleared successfully.", "success");
}

function exportChatHistory() {
  const chat = getActiveChat();
  if (!chat || chat.messages.length === 0) {
    showToast("No messages to export.", "error");
    return;
  }

  let text = "Blood Donation & Emergency Connect Bot — Chat Export\n";
  text += `Chat: ${chat.title}\n`;
  text += `Exported: ${new Date().toLocaleString()}\n`;
  text += "=".repeat(50) + "\n\n";

  chat.messages.forEach(({ role, content, timestamp }) => {
    const label = role === "user" ? "You" : "Bot";
    const time = new Date(timestamp).toLocaleString();
    text += `[${time}] ${label}:\n${content}\n\n`;
  });

  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bloodconnect-${chat.id}.txt`;
  link.click();
  URL.revokeObjectURL(url);

  showToast("Chat exported successfully!", "success");
}

/* ============================================
   Voice Input (Web Speech API)
   ============================================ */

function initSpeechRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    DOM.voiceBtn.style.display = "none";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    isListening = true;
    DOM.voiceBtn.classList.add("listening");
    showToast("Listening...", "info");
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    DOM.chatInput.value = sanitizeInput(transcript);
    autoResizeTextarea();
  };

  recognition.onerror = (event) => {
    if (event.error !== "aborted") {
      showToast(`Voice input error: ${event.error}`, "error");
    }
  };

  recognition.onend = () => {
    isListening = false;
    DOM.voiceBtn.classList.remove("listening");
  };
}

function toggleVoiceInput() {
  if (!recognition) {
    showToast("Voice input is not supported in this browser.", "error");
    return;
  }

  if (isListening) {
    recognition.stop();
  } else {
    recognition.start();
  }
}

/* ============================================
   Text-to-Speech
   ============================================ */

function initTTS() {
  const saved = localStorage.getItem(STORAGE_KEYS.TTS_ENABLED);
  ttsEnabled = saved === "true";
  DOM.ttsToggleBtn.classList.toggle("active", ttsEnabled);
}

function toggleTTS() {
  ttsEnabled = !ttsEnabled;
  localStorage.setItem(STORAGE_KEYS.TTS_ENABLED, String(ttsEnabled));
  DOM.ttsToggleBtn.classList.toggle("active", ttsEnabled);
  showToast(ttsEnabled ? "Text-to-speech enabled." : "Text-to-speech disabled.");

  if (!ttsEnabled) {
    window.speechSynthesis.cancel();
  }
}

function speakText(text) {
  if (!window.speechSynthesis) {
    showToast("Text-to-speech is not supported in this browser.", "error");
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

/* ============================================
   Emergency Form
   ============================================ */

function handleEmergencySubmit(event) {
  event.preventDefault();

  const formData = new FormData(DOM.emergencyForm);
  const data = {
    patientName: sanitizeInput(formData.get("patientName")),
    bloodGroup: formData.get("bloodGroup"),
    location: sanitizeInput(formData.get("location")),
    contactNumber: sanitizeInput(formData.get("contactNumber")),
    unitsNeeded: formData.get("unitsNeeded"),
    urgency: formData.get("urgency"),
    additionalInfo: sanitizeInput(formData.get("additionalInfo") || ""),
  };

  if (!data.patientName || !data.bloodGroup || !data.location || !data.contactNumber) {
    showToast("Please fill in all required fields.", "error");
    return;
  }

  const urgencyLabels = {
    critical: "CRITICAL — Immediate",
    urgent: "Urgent — Within 24 hours",
    moderate: "Moderate — Within 48 hours",
  };

  showToast("Emergency request submitted! Opening chat for guidance...", "success");
  DOM.emergencyForm.reset();

  navigateTo("chat");

  setTimeout(() => {
    handleSendMessage(
      `I submitted an emergency blood request. Patient: ${data.patientName}, Blood group needed: ${data.bloodGroup}, ${data.unitsNeeded} unit(s), Location: ${data.location}, Urgency: ${urgencyLabels[data.urgency]}. What are the immediate next steps I should take?`
    );
  }, 500);
}

/* ============================================
   Scroll Animations & Stats Counter
   ============================================ */

function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          if (entry.target.classList.contains("stat-card")) {
            animateCounter(entry.target.querySelector(".stat-number"));
          }
        }
      });
    },
    { threshold: 0.15 }
  );

  document.querySelectorAll(".animate-on-scroll").forEach((el) => observer.observe(el));
}

function animateCounter(element) {
  if (!element || element.dataset.animated) return;
  element.dataset.animated = "true";

  const target = parseInt(element.dataset.target, 10);
  const duration = 1500;
  const start = performance.now();

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.floor(eased * target);
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

/* ============================================
   Event Listeners
   ============================================ */

function initEventListeners() {
  DOM.themeToggle.addEventListener("click", toggleTheme);
  DOM.themeToggleMobile.addEventListener("click", toggleTheme);

  DOM.menuBtn.addEventListener("click", openSidebar);
  DOM.sidebarClose.addEventListener("click", closeSidebar);
  DOM.sidebarOverlay.addEventListener("click", closeSidebar);

  DOM.navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo(link.dataset.section);
    });
  });

  DOM.startChatBtn.addEventListener("click", () => navigateTo("chat"));
  DOM.emergencyBtn.addEventListener("click", () => navigateTo("emergency"));

  DOM.newChatBtn.addEventListener("click", startNewChat);
  DOM.newChatFromListBtn.addEventListener("click", startNewChat);

  DOM.sendBtn.addEventListener("click", () => handleSendMessage());

  DOM.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  DOM.chatInput.addEventListener("input", autoResizeTextarea);

  DOM.exportChatBtn.addEventListener("click", exportChatHistory);
  DOM.clearChatBtn.addEventListener("click", clearChat);

  DOM.quickBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      navigateTo("chat");
      handleSendMessage(btn.dataset.prompt);
    });
  });

  DOM.voiceBtn.addEventListener("click", toggleVoiceInput);
  DOM.ttsToggleBtn.addEventListener("click", toggleTTS);

  DOM.emergencyForm.addEventListener("submit", handleEmergencySubmit);

  DOM.guideChatBtn.addEventListener("click", () => {
    navigateTo("chat");
    handleSendMessage("Walk me through the complete blood donation process step by step.");
  });

  DOM.eligibilityChatBtn.addEventListener("click", () => {
    navigateTo("chat");
    handleSendMessage("What are all the eligibility requirements for donating blood?");
  });

  DOM.faqChatBtn.addEventListener("click", () => {
    navigateTo("chat");
    handleSendMessage("What are the most common FAQs and myths about blood donation?");
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) closeSidebar();
  });
}

/* ============================================
   Initialization
   ============================================ */

function init() {
  initMarkdown();
  initTheme();
  initTTS();
  initSpeechRecognition();
  initEventListeners();
  initScrollAnimations();
  loadChats();
  renderChatMessages();
  renderChatsList();
  autoResizeTextarea();
}

document.addEventListener("DOMContentLoaded", init);
