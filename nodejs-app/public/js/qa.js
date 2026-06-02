/**
 * 证据问答 (Q&A) 模块
 */
function initQA() {
  const messagesContainer = document.getElementById('qa-messages');
  const input = document.getElementById('qa-input');
  const submitBtn = document.getElementById('qa-submit-btn');

  const messages = [];

  function addMessage(role, content, sources) {
    messages.push({ role, content, sources });
    renderMessages();
  }

  function renderMessages() {
    let html = '';
    messages.forEach(msg => {
      html += `<div class="qa-message qa-${msg.role}">
        <div class="qa-role">${msg.role === 'user' ? 'You' : 'AI'}</div>
        <div class="qa-content">${msg.content}</div>`;

      if (msg.sources && msg.sources.length) {
        html += '<details class="qa-sources"><summary>Evidence Sources</summary>';
        msg.sources.slice(0, 5).forEach(src => {
          html += `<div class="qa-source">${src.slice(0, 300)}...</div>`;
        });
        html += '</details>';
      }

      html += '</div>';
    });
    messagesContainer.innerHTML = html;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  async function sendQuestion() {
    const question = input.value.trim();
    if (!question) return;
    if (!window.appState?.apiConfigured) {
      addMessage('assistant', 'Error: Please configure API and Neo4j connection first.');
      return;
    }

    addMessage('user', question);
    input.value = '';
    submitBtn.disabled = true;

    try {
      const resp = await fetch('/api/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          provider: window.appState.llmProvider || 'deepseek',
        }),
      });
      const data = await resp.json();
      addMessage('assistant', data.answer || data.error, data.sources);
    } catch (e) {
      addMessage('assistant', `Error: ${e.message}`);
    } finally {
      submitBtn.disabled = false;
      input.focus();
    }
  }

  submitBtn.addEventListener('click', sendQuestion);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  });
}
