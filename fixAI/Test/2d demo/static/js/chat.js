// static/js/chat.js

const socket = io();

const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (message !== '') {
        socket.emit('chatMessage', { message });
        chatInput.value = '';
    }
});

socket.on('chatMessage', (data) => {
    addMessage(data.name, data.message);
});

function addMessage(name, message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');
    messageElement.innerHTML = `<strong>${name}:</strong> ${message}`;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
