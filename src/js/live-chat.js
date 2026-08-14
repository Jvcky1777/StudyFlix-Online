import { db } from './firebase.js';
import { collection, addDoc, onSnapshot, query, orderBy } from 'firebase/firestore';

// =======================================================================
// REAL-TIME CHAT MANAGER
// Strictly handles database messaging and sidebar UI updates.
// =======================================================================

export async function sendMessage(roomId, text, userName, role) {
  if (!text.trim() || !roomId) return;
  
  try {
    const messagesRef = collection(db, 'classrooms', roomId, 'messages');
    await addDoc(messagesRef, {
      text: text,
      senderName: userName,
      senderRole: role,
      timestamp: Date.now() // Enables strict chronological ordering
    });
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

export function listenForMessages(roomId) {
  if (!roomId) return;

  const messagesRef = collection(db, 'classrooms', roomId, 'messages');
  // Query Firestore to pull messages in chronological order
  const q = query(messagesRef, orderBy('timestamp', 'asc'));

  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      // Only process brand new messages
      if (change.type === 'added') {
        const data = change.doc.data();
        displayMessage(data.text, data.senderName, data.senderRole);
      }
    });
  });
}

function displayMessage(text, senderName, senderRole) {
  const chatFeed = document.getElementById('chat-feed');
  if (!chatFeed) return;

  const msgDiv = document.createElement('div');
  msgDiv.style.cssText = 'font-size: 0.9rem; margin-bottom: 12px; line-height: 1.4;';

  const nameSpan = document.createElement('span');
  // Color code based on role (Purple for Instructor, Cyan for Student)
  nameSpan.style.color = senderRole === 'instructor' ? 'var(--neon-purple)' : 'var(--neon-cyan)';
  nameSpan.style.fontWeight = 'bold';
  nameSpan.textContent = senderRole === 'instructor' ? `Prof. ${senderName}: ` : `${senderName}: `;

  const textSpan = document.createElement('span');
  textSpan.style.color = 'var(--text-main)';
  textSpan.textContent = text;

  msgDiv.appendChild(nameSpan);
  msgDiv.appendChild(textSpan);
  chatFeed.appendChild(msgDiv);

  // Auto-scroll to the bottom when a new message arrives
  chatFeed.scrollTop = chatFeed.scrollHeight;
}