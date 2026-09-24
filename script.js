const chatContainer = document.getElementById("chatContainer");
const messages = document.getElementById("messages");
const welcome = document.getElementById("welcome");

const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

const newChatBtn = document.getElementById("newChat");
const chatHistory = document.getElementById("chatHistory");

const openSidebar = document.getElementById("openSidebar");
const closeSidebar = document.getElementById("closeSidebar");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");

const themeToggle = document.getElementById("themeToggle");

let conversation = [];
let isGenerating = false;
let controller = null;

/* =========================
   LOCAL STORAGE
========================= */

function saveConversation() {
    localStorage.setItem(
        "ai-z-conversation",
        JSON.stringify(conversation)
    );
}

function loadConversation() {
    try {
        const saved = localStorage.getItem("ai-z-conversation");

        if (!saved) return;

        conversation = JSON.parse(saved);

        if (conversation.length > 0) {
            welcome.style.display = "none";

            conversation.forEach(message => {
                addMessage(
                    message.role,
                    message.content,
                    false
                );
            });
        }
    } catch (error) {
        console.error("Failed to load conversation:", error);
    }
}

/* =========================
   ESCAPE HTML
========================= */

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

/* =========================
   MARKDOWN
========================= */

function renderMarkdown(text) {
    if (typeof marked === "undefined") {
        return escapeHTML(text).replace(/\n/g, "<br>");
    }

    marked.setOptions({
        breaks: true,
        gfm: true
    });

    let html = marked.parse(text);

    html = DOMPurify.sanitize(html);

    return html;
}

/* =========================
   ADD MESSAGE
========================= */

function addMessage(role, content, showActions = true) {

    const message = document.createElement("div");

    message.className = `message ${role}`;

    if (role === "assistant") {

        message.innerHTML = `
            <div class="message-avatar">Z</div>

            <div>
                <div class="message-content">
                    <div class="message-text">
                        ${renderMarkdown(content)}
                    </div>
                </div>

                ${
                    showActions
                        ? `
                        <div class="message-actions">
                            <button
                                class="message-action copy-answer"
                                type="button"
                                title="Copy"
                            >
                                📋
                            </button>

                            <button
                                class="message-action regenerate"
                                type="button"
                                title="Regenerate"
                            >
                                ↻
                            </button>
                        </div>
                        `
                        : ""
                }
            </div>
        `;

    } else {

        message.innerHTML = `
            <div class="message-content">
                <div class="message-text">
                    ${escapeHTML(content).replace(/\n/g, "<br>")}
                </div>
            </div>
        `;
    }

    messages.appendChild(message);

    scrollToBottom();

    return message;
}

/* =========================
   SCROLL
========================= */

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

/* =========================
   TYPING
========================= */

function showTyping() {

    const typing = document.createElement("div");

    typing.className = "message assistant";
    typing.id = "typingMessage";

    typing.innerHTML = `
        <div class="message-avatar">Z</div>

        <div class="message-content">
            <div class="typing">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;

    messages.appendChild(typing);

    scrollToBottom();
}

function removeTyping() {
    const typing = document.getElementById("typingMessage");

    if (typing) {
        typing.remove();
    }
}

/* =========================
   SEND MESSAGE
========================= */

async function sendMessage() {

    const text = userInput.value.trim();

    if (!text || isGenerating) return;

    welcome.style.display = "none";

    addMessage("user", text);

    conversation.push({
        role: "user",
        content: text
    });

    saveConversation();

    userInput.value = "";
    autoResize();

    isGenerating = true;
    sendBtn.disabled = true;

    showTyping();

    controller = new AbortController();

    try {

        const response = await fetch("/api/chat", {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                messages: conversation
            }),

            signal: controller.signal
        });

        removeTyping();

        if (!response.ok) {

            let errorMessage = "Terjadi kesalahan pada server.";

            try {
                const data = await response.json();

                if (data.error) {
                    errorMessage = data.error;
                }

            } catch (_) {}

            throw new Error(errorMessage);
        }

        const contentType =
            response.headers.get("content-type") || "";

        let assistantText = "";

        /*
         * Jika backend mengirim JSON biasa
         */
        if (contentType.includes("application/json")) {

            const data = await response.json();

            assistantText =
                data.message ||
                data.output ||
                data.content ||
                data.text ||
                "";

        }

        /*
         * Jika backend mengirim streaming
         */
        else {

            const reader = response.body.getReader();

            const decoder = new TextDecoder();

            let buffer = "";

            const assistantMessage = addMessage(
                "assistant",
                "",
                true
            );

            const textElement =
                assistantMessage.querySelector(".message-text");

            while (true) {

                const { value, done } =
                    await reader.read();

                if (done) break;

                buffer += decoder.decode(
                    value,
                    { stream: true }
                );

                const lines =
                    buffer.split("\n");

                buffer = lines.pop() || "";

                for (const line of lines) {

                    const trimmed =
                        line.trim();

                    if (!trimmed) continue;

                    if (!trimmed.startsWith("data:")) {
                        continue;
                    }

                    const data =
                        trimmed.substring(5).trim();

                    if (data === "[DONE]") {
                        continue;
                    }

                    try {

                        const parsed =
                            JSON.parse(data);

                        const token =
                            parsed.text ||
                            parsed.content ||
                            parsed.delta ||
                            "";

                        if (token) {

                            assistantText += token;

                            textElement.innerHTML =
                                renderMarkdown(
                                    assistantText
                                );

                            scrollToBottom();
                        }

                    } catch (_) {
                        // Abaikan data SSE yang bukan JSON
                    }
                }
            }

            /*
             * Jika streaming tidak menghasilkan teks,
             * hapus pesan kosong.
             */
            if (!assistantText) {
                assistantMessage.remove();
            }
        }

        if (!assistantText) {
            assistantText =
                "Maaf, AI Z tidak menerima jawaban dari server.";
        }

        /*
         * Untuk JSON biasa, tampilkan pesan di sini.
         * Untuk streaming, pesan sudah dibuat sebelumnya.
         */
        if (
            !messages.lastElementChild ||
            !messages.lastElementChild
                .classList.contains("assistant")
        ) {
            addMessage(
                "assistant",
                assistantText,
                true
            );
        }

        /*
         * Pastikan pesan terakhir memiliki isi
         */
        const assistantMessages =
            messages.querySelectorAll(
                ".message.assistant"
            );

        const lastAssistant =
            assistantMessages[
                assistantMessages.length - 1
            ];

        if (lastAssistant) {

            const textElement =
                lastAssistant.querySelector(
                    ".message-text"
                );

            if (
                textElement &&
                !textElement.textContent.trim()
            ) {
                textElement.innerHTML =
                    renderMarkdown(assistantText);
            }
        }

        conversation.push({
            role: "assistant",
            content: assistantText
        });

        saveConversation();

        addHistoryItem(text);

    } catch (error) {

        removeTyping();

        if (error.name === "AbortError") {

            addMessage(
                "assistant",
                "Generasi jawaban dihentikan."
            );

        } else {

            console.error(error);

            addMessage(
                "assistant",
                `⚠️ ${error.message}`
            );
        }

    } finally {

        isGenerating = false;

        sendBtn.disabled = false;

        controller = null;

        userInput.focus();
    }
}

/* =========================
   NEW CHAT
========================= */

function newChat() {

    if (isGenerating && controller) {
        controller.abort();
    }

    conversation = [];

    localStorage.removeItem(
        "ai-z-conversation"
    );

    messages.innerHTML = "";

    welcome.style.display = "flex";

    userInput.value = "";

    autoResize();

    isGenerating = false;

    sendBtn.disabled = false;

    renderHistory();

    userInput.focus();
}

/* =========================
   HISTORY
========================= */

function addHistoryItem(text) {

    const history =
        JSON.parse(
            localStorage.getItem(
                "ai-z-history"
            ) || "[]"
        );

    history.unshift(text);

    const uniqueHistory =
        [...new Set(history)].slice(0, 20);

    localStorage.setItem(
        "ai-z-history",
        JSON.stringify(uniqueHistory)
    );

    renderHistory();
}

function renderHistory() {

    chatHistory.innerHTML = "";

    const history =
        JSON.parse(
            localStorage.getItem(
                "ai-z-history"
            ) || "[]"
        );

    history.forEach(text => {

        const item =
            document.createElement("div");

        item.className = "history-item";

        item.textContent = text;

        item.title = text;

        item.addEventListener(
            "click",
            () => {

                userInput.value = text;

                autoResize();

                closeMobileSidebar();
            }
        );

        chatHistory.appendChild(item);
    });
}

/* =========================
   SUGGESTIONS
========================= */

document.querySelectorAll(
    ".suggestion"
).forEach(button => {

    button.addEventListener(
        "click",
        () => {

            const prompt =
                button.dataset.prompt;

            userInput.value = prompt;

            autoResize();

            userInput.focus();

            sendMessage();
        }
    );
});

/* =========================
   ENTER KEY
========================= */

userInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            sendMessage();
        }
    }
);

/* =========================
   AUTO RESIZE
========================= */

function autoResize() {

    userInput.style.height = "auto";

    userInput.style.height =
        Math.min(
            userInput.scrollHeight,
            180
        ) + "px";
}

userInput.addEventListener(
    "input",
    autoResize
);

/* =========================
   SEND BUTTON
========================= */

sendBtn.addEventListener(
    "click",
    sendMessage
);

/* =========================
   NEW CHAT BUTTON
========================= */

newChatBtn.addEventListener(
    "click",
    newChat
);

/* =========================
   MOBILE SIDEBAR
========================= */

function openMobileSidebar() {

    sidebar.classList.add("open");

    sidebarOverlay.classList.add(
        "active"
    );
}

function closeMobileSidebar() {

    sidebar.classList.remove("open");

    sidebarOverlay.classList.remove(
        "active"
    );
}

openSidebar.addEventListener(
    "click",
    openMobileSidebar
);

closeSidebar.addEventListener(
    "click",
    closeMobileSidebar
);

sidebarOverlay.addEventListener(
    "click",
    closeMobileSidebar
);

/* =========================
   COPY ANSWER
========================= */

document.addEventListener(
    "click",
    async event => {

        const button =
            event.target.closest(
                ".copy-answer"
            );

        if (!button) return;

        const message =
            button.closest(".message");

        const textElement =
            message.querySelector(
                ".message-text"
            );

        if (!textElement) return;

        const text =
            textElement.innerText;

        try {

            await navigator.clipboard.writeText(
                text
            );

            button.textContent = "✓";

            setTimeout(() => {
                button.textContent = "📋";
            }, 1500);

        } catch (error) {

            console.error(
                "Copy failed:",
                error
            );
        }
    }
);

/* =========================
   REGENERATE
========================= */

document.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                ".regenerate"
            );

        if (!button || isGenerating) {
            return;
        }

        /*
         * Ambil pesan user terakhir.
         */
        let lastUserMessage = null;

        for (
            let i = conversation.length - 1;
            i >= 0;
            i--
        ) {

            if (
                conversation[i].role === "user"
            ) {

                lastUserMessage =
                    conversation[i].content;

                break;
            }
        }

        if (!lastUserMessage) return;

        /*
         * Hapus jawaban assistant terakhir
         */
        const assistantMessages =
            messages.querySelectorAll(
                ".message.assistant"
            );

        const lastAssistant =
            assistantMessages[
                assistantMessages.length - 1
            ];

        if (lastAssistant) {
            lastAssistant.remove();
        }

        /*
         * Hapus jawaban assistant dari
         * conversation.
         */
        if (
            conversation.length > 0 &&
            conversation[
                conversation.length - 1
            ].role === "assistant"
        ) {

            conversation.pop();

            saveConversation();
        }

        sendMessageFromExisting();
    }
);

/* =========================
   REGENERATE REQUEST
========================= */

async function sendMessageFromExisting() {

    if (isGenerating) return;

    isGenerating = true;

    sendBtn.disabled = true;

    controller = new AbortController();

    showTyping();

    try {

        const response = await fetch(
            "/api/chat",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    messages: conversation
                }),

                signal: controller.signal
            }
        );

        removeTyping();

        if (!response.ok) {
            throw new Error(
                "Server tidak dapat memproses permintaan."
            );
        }

        const data = await response.json();

        const answer =
            data.message ||
            data.output ||
            data.content ||
            data.text ||
            "Tidak ada jawaban.";

        addMessage(
            "assistant",
            answer,
            true
        );

        conversation.push({
            role: "assistant",
            content: answer
        });

        saveConversation();

    } catch (error) {

        removeTyping();

        if (error.name !== "AbortError") {

            addMessage(
                "assistant",
                `⚠️ ${error.message}`
            );
        }

    } finally {

        isGenerating = false;

        sendBtn.disabled = false;

        controller = null;
    }
}

/* =========================
   CODE COPY
========================= */

document.addEventListener(
    "click",
    async event => {

        const button =
            event.target.closest(
                ".copy-code"
            );

        if (!button) return;

        const wrapper =
            button.closest(
                ".code-wrapper"
            );

        const code =
            wrapper.querySelector("code");

        if (!code) return;

        try {

            await navigator.clipboard.writeText(
                code.innerText
            );

            button.textContent = "Copied!";

            setTimeout(() => {
                button.textContent = "Copy";
            }, 1500);

        } catch (error) {

            console.error(
                "Code copy failed:",
                error
            );
        }
    }
);

/* =========================
   THEME
========================= */

themeToggle.addEventListener(
    "click",
    () => {

        document.body.classList.toggle(
            "light-mode"
        );

        const light =
            document.body.classList.contains(
                "light-mode"
            );

        localStorage.setItem(
            "ai-z-theme",
            light ? "light" : "dark"
        );
    }
);

/* =========================
   INIT
========================= */

function loadTheme() {

    const theme =
        localStorage.getItem(
            "ai-z-theme"
        );

    if (theme === "light") {

        document.body.classList.add(
            "light-mode"
        );
    }
}

loadTheme();

loadConversation();

renderHistory();

autoResize();
