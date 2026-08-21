// src/js/student_d.js

// 1. Import initialized instances from our central config
import { db } from './firebase.js'; // auth is in session.js handled

// 2. Import required SDK functions
import { collection, query, where, doc, getDoc, onSnapshot } from "firebase/firestore";

// 3. Initialize Dashboard Data
document.addEventListener('DOMContentLoaded', () => {
  // session.js handles the UI, so we just fire the data listeners!
  listenForClasses();
  listenForPastClasses();
});

// =======================================================================
// ACTION PANEL LOGIC: Custom Modal & Room Code Verification
// =======================================================================
const joinLiveClassBtn = document.getElementById('joinLiveClassBtn');
const roomModal = document.getElementById('room-modal');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalJoinBtn = document.getElementById('modal-join-btn');
const roomCodeInput = document.getElementById('room-code-input');

// 1. Open Modal when clicking "Join Class"
if (joinLiveClassBtn && roomModal) {
  joinLiveClassBtn.addEventListener('click', () => {
    roomModal.style.display = 'flex';
    if (roomCodeInput) {
      roomCodeInput.value = '';
      roomCodeInput.focus();
    }
  });
}

// 2. Close Modal on Cancel
if (modalCancelBtn && roomModal) {
  modalCancelBtn.addEventListener('click', () => {
    roomModal.style.display = 'none';
  });
}

// 3. Verify Room Code in Firestore and Route Accordingly
if (modalJoinBtn && roomCodeInput) {
  modalJoinBtn.addEventListener('click', async () => {
    const roomCode = roomCodeInput.value.trim();

    if (!roomCode || roomCode.length < 5) {
      alert("Please enter a valid room code.");
      return;
    }

    modalJoinBtn.textContent = "Verifying...";
    modalJoinBtn.disabled = true;

    try {
      const roomRef = doc(db, 'classrooms', roomCode);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        // Room does not exist -> Go to Class Not Found page
        window.location.href = './class-not-found.html';
        return;
      }

      const roomData = roomSnap.data();
      if (roomData.status === 'ended') {
        // Room has ended -> Go to Session Ended page
        window.location.href = './session-ended.html';
        return;
      }

      // Valid active room -> Enter the live room
      window.location.href = `./classroom-live.html?room=${roomCode}`;

    } catch (error) {
      console.error("Error verifying room code:", error);
      alert("An error occurred while connecting to the classroom. Please try again.");
      modalJoinBtn.textContent = "Join Class";
      modalJoinBtn.disabled = false;
    }
  });
}

// =======================================================================
// DYNAMIC CLASS LISTENER
// =======================================================================
function listenForClasses() {
  const classesRef = collection(db, 'classrooms');
  // Only fetch classes that are live or scheduled
  const q = query(classesRef, where('status', 'in', ['live', 'scheduled']));

  onSnapshot(q, (snapshot) => {
    const grid = document.getElementById('student-classes-grid');
    if (!grid) return;
    grid.innerHTML = ''; // Clear out the old grid on every update

    if (snapshot.empty) {
      grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1;">No upcoming or live classes at the moment.</p>';
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const classId = docSnap.id; // The room code
      const isLive = data.status === 'live';
      
      // Fallbacks in case the teacher started an ad-hoc room without titles
      const title = data.title || 'Ad-Hoc Live Session';
      const module = data.module || 'General Session';
      const timeText = isLive ? 'Started Recently' : (data.scheduledTime || 'Scheduled');

      const card = document.createElement('div');
      card.className = 'dash-card';

      const tag = isLive 
        ? `<span class="tag live">● Live Now</span>` 
        : `<span class="tag upcoming">Upcoming</span>`;
      
      const titleColor = isLive ? 'var(--neon-purple)' : 'var(--neon-cyan)';
      
      // Sanitize the title just in case it has quotes in it
      const safeTitle = title.replace(/'/g, "\\'"); 

      // Inject the dynamic ID and onclick listener into the scheduled button
      const actionBtn = isLive
        ? `<button class="secondary" onclick="openJoinModal('${classId}')">Join Class</button>`
        : `<button id="remind-btn-${classId}" style="border-color: rgba(255,255,255,0.2); color: var(--text-main);" onclick="toggleReminder('${classId}', '${safeTitle}', ${data.scheduledTimestamp})">🔔 Set Reminder</button>`;

      card.innerHTML = `
        ${tag}
        <h3 style="color: ${titleColor}; margin-bottom: 10px;">${title}</h3>
        <p style="color: var(--text-muted); margin-bottom: 15px;">${timeText}</p>
        <p style="font-size: 0.9rem; margin-bottom: 20px;">${module}</p>
        ${actionBtn}
      `;
      grid.appendChild(card);
    });
  });
}

// Global function so inline HTML onclick buttons can trigger the modal
window.openJoinModal = (roomId) => {
  const roomModal = document.getElementById('room-modal');
  const roomCodeInput = document.getElementById('room-code-input');
  if (roomModal) roomModal.style.display = 'flex';
  if (roomCodeInput) {
    roomCodeInput.value = roomId; // Auto-fill the code!
  }
};

// =======================================================================
// PAST CLASS LISTENER
// =======================================================================
function listenForPastClasses() {
  const classesRef = collection(db, 'classrooms');
  // Fetch ONLY classes that have properly ended
  const q = query(classesRef, where('status', '==', 'ended'));

  onSnapshot(q, (snapshot) => {
    const grid = document.getElementById('student-past-classes-grid');
    if (!grid) return;
    grid.innerHTML = ''; 

    if (snapshot.empty) {
      grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1;">No previous classes available.</p>';
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const title = data.title || 'Ad-Hoc Live Session';
      const module = data.module || 'General Session';

      const card = document.createElement('div');
      card.className = 'dash-card';
      
      // Dim the card visually and disable clicking so it looks like history
      card.style.opacity = '0.5'; 
      card.style.pointerEvents = 'none'; 

      card.innerHTML = `
        <span class="tag" style="background: rgba(255,255,255,0.1); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.2);">Ended</span>
        <h3 style="color: var(--text-muted); margin-bottom: 10px;">${title}</h3>
        <p style="color: var(--text-muted); margin-bottom: 15px;">Session Closed</p>
        <p style="font-size: 0.9rem; margin-bottom: 20px;">${module}</p>
        <button class="secondary" disabled style="opacity: 0.5;">Recording Unavailable</button>
      `;
      grid.appendChild(card);
    });
  });
}

// =======================================================================
// CUSTOM TOAST NOTIFICATION & REMINDER LOGIC
// =======================================================================
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 30px; right: 30px; background: var(--bg-surface);
    border: 1px solid var(--neon-cyan); box-shadow: var(--glow-cyan);
    color: white; padding: 15px 25px; border-radius: 8px; font-weight: 500;
    z-index: 9999; opacity: 0; transform: translateY(20px);
    transition: all 0.4s ease; backdrop-filter: blur(10px);
  `;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; }, 10);
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// Global object to track timers so we can cancel them if they toggle it off
window.reminderTimeouts = {};

window.toggleReminder = async (classId, className, scheduledTimestamp) => {
  const btn = document.getElementById(`remind-btn-${classId}`);
  if (!btn) return;

  // ==========================================
  // SCENARIO 1: TURNING THE REMINDER ON
  // ==========================================
  if (btn.textContent.includes('Set Reminder')) {
    
    // 1. Update the UI visually
    btn.innerHTML = '✅ Reminder Set';
    btn.style.background = 'var(--neon-cyan)'; 
    btn.style.color = 'var(--bg-base)'; 
    btn.style.boxShadow = 'var(--glow-cyan)';
    showToast(`🔔 We'll remind you before "${className}" starts!`);

    // 2. THE EMAILJS ROUTE (Background Task)
    try {
      await emailjs.send(
        import.meta.env.VITE_EMAILJS_SERVICE_ID, 
        import.meta.env.VITE_EMAILJS_TEMPLATE_ID, 
        {
          to_email: auth.currentUser.email,
          class_name: className,
          message: `This is a reminder that your live session for ${className} is starting soon! Log into your dashboard to join the room.`
        }, 
        import.meta.env.VITE_EMAILJS_PUBLIC_KEY
      );
      console.log("Email reminder queued successfully.");
    } catch (error) {
      console.error("EmailJS failed to send:", error);
    }

    // 3. THE WEB PUSH ROUTE (Device Notification)
    if ("Notification" in window) {
      let perm = Notification.permission;
      if (perm !== "granted" && perm !== "denied") {
        perm = await Notification.requestPermission();
      }

      if (perm === "granted") {
        // Calculate the exact milliseconds until 15 minutes before the class
        const timeUntilClass = scheduledTimestamp - Date.now();
        const timeUntilReminder = timeUntilClass - (15 * 60 * 1000); 

        // If the class is more than 15 minutes away, set the timer
        if (timeUntilReminder > 0) {
          window.reminderTimeouts[classId] = setTimeout(() => {
            new Notification("Classroom Live 🔴", {
              body: `Heads up! "${className}" is starting in 15 minutes.`,
              icon: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
            });
          }, timeUntilReminder);
          console.log(`Push notification scheduled for 15 mins before ${className}`);
        }
      }
    }

  // ==========================================
  // SCENARIO 2: CANCELLING THE REMINDER
  // ==========================================
  } else {
    // 1. Revert the UI
    btn.innerHTML = '🔔 Set Reminder';
    btn.style.background = 'transparent'; 
    btn.style.color = 'var(--text-main)'; 
    btn.style.boxShadow = 'none';
    showToast(`🔕 Reminder cancelled for "${className}".`);

    // 2. Cancel the pending Push Notification timer
    if (window.reminderTimeouts[classId]) {
      clearTimeout(window.reminderTimeouts[classId]);
      delete window.reminderTimeouts[classId];
      console.log("Push notification timer cancelled.");
    }
  }
};